import { randomUUID } from 'node:crypto';
import type {
  ChatAttachment,
  ChatMessage,
  ChatReaction,
  ChannelMedia,
  ChannelResources,
} from '../src/shared/community.js';
import { attachmentLimit, messageLinks, reactionEmojis } from '../src/shared/chat.js';
import { has, Permission } from '../src/shared/permissions.js';
import { withServer } from './access.js';
import { CommunityService } from './community-service.js';
import type { Database } from './database.js';
import { HttpError } from './security.js';

/** Only passive formats. Files are classified from their bytes, not extensions. */
export function attachmentMime(bytes: Buffer, declared: string): string {
  if (!bytes.length || bytes.length > attachmentLimit)
    throw new HttpError(413, 'Files must be between 1 byte and 25 MB.');
  if (bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return 'image/png';
  if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return 'image/jpeg';
  if (['GIF87a', 'GIF89a'].includes(bytes.subarray(0, 6).toString('ascii'))) return 'image/gif';
  if (bytes.subarray(0, 4).toString('ascii') === 'RIFF') {
    if (bytes.subarray(8, 12).toString('ascii') === 'WEBP') return 'image/webp';
    if (bytes.subarray(8, 12).toString('ascii') === 'WAVE') return 'audio/wav';
  }
  if (bytes.subarray(4, 8).toString('ascii') === 'ftyp')
    return declared === 'audio/mp4' ? 'audio/mp4' : 'video/mp4';
  if (bytes.subarray(0, 4).equals(Buffer.from([26, 69, 223, 163])))
    return declared === 'audio/webm' ? 'audio/webm' : 'video/webm';
  if (bytes.subarray(0, 4).toString('ascii') === 'OggS') return 'audio/ogg';
  if (bytes.subarray(0, 3).toString('ascii') === 'ID3' || (bytes[0] === 255 && (bytes[1] & 0xe0) === 0xe0))
    return 'audio/mpeg';
  if (bytes.subarray(0, 5).toString('ascii') === '%PDF-') return 'application/pdf';
  if (declared === 'text/plain' && !bytes.includes(0) && Buffer.from(bytes.toString('utf8')).equals(bytes))
    return 'text/plain';
  throw new HttpError(415, 'Choose a PNG, JPEG, GIF, WebP, MP4, WebM, MP3, WAV, OGG, M4A, PDF or text file.');
}

export class ChatService {
  constructor(
    private readonly db: Database,
    private readonly communities: CommunityService,
  ) {}

  async messages(userId: string, channelId: string, before?: string): Promise<ChatMessage[]> {
    const messages = await this.communities.messages(userId, channelId, before);
    if (!messages.length) return messages;
    const ids = messages.map((message) => message.id);
    const attachments = await this.db.query<ChatAttachment & { messageId: string }>(
      'SELECT id,name,mime,size,message_id AS "messageId" FROM chat_attachments WHERE message_id=ANY($1::uuid[]) ORDER BY created_at,id',
      [ids],
    );
    const reactions = await this.db.query<ChatReaction & { messageId: string }>(
      'SELECT message_id AS "messageId",emoji,count(*)::int AS count,bool_or(account_id=$2) AS mine FROM message_reactions WHERE message_id=ANY($1::uuid[]) GROUP BY message_id,emoji ORDER BY emoji',
      [ids, userId],
    );
    return messages.map((message) => ({
      ...message,
      attachments: attachments.rows
        .filter((file) => file.messageId === message.id)
        .map(({ messageId, ...file }) => file),
      reactions: reactions.rows
        .filter((reaction) => reaction.messageId === message.id)
        .map(({ messageId, ...reaction }) => reaction),
    }));
  }

  async upload(
    userId: string,
    channelId: string,
    bytes: Buffer,
    name: string,
    declared: string,
  ): Promise<ChatAttachment> {
    const { channel } = await this.communities.channel(userId, channelId);
    const mime = attachmentMime(bytes, declared);
    const cleanName = name
      .split(/[\\/]/)
      .pop()!
      .replace(/[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/g, '')
      .trim()
      .slice(0, 180);
    if (!cleanName) throw new HttpError(400, 'The file needs a name.');
    return withServer(this.db, userId, channel.serverId, async (db) => {
      await this.requireWriting(userId, channelId, db);
      await db.query(
        "DELETE FROM chat_attachments WHERE message_id IS NULL AND created_at < now()-interval '24 hours'",
      );
      const {
        rows: [usage],
      } = await db.query<{ size: number }>(
        'SELECT COALESCE(sum(size),0)::bigint AS size FROM chat_attachments WHERE uploader_id=$1 AND channel_id=$2',
        [userId, channelId],
      );
      if (Number(usage.size) + bytes.length > 512 * 1024 * 1024)
        throw new HttpError(
          413,
          'Your uploads in this channel reached 512 MB. Remove older messages before uploading more.',
        );
      const file = { id: randomUUID(), name: cleanName, mime, size: bytes.length };
      await db.query(
        'INSERT INTO chat_attachments(id,channel_id,uploader_id,name,mime,size,bytes) VALUES($1,$2,$3,$4,$5,$6,$7)',
        [file.id, channelId, userId, cleanName, mime, bytes.length, bytes],
      );
      return file;
    });
  }

  async read(
    userId: string,
    channelId: string,
    attachmentId: string,
  ): Promise<ChatAttachment & { bytes: Buffer }> {
    await this.communities.channel(userId, channelId);
    const {
      rows: [file],
    } = await this.db.query<ChatAttachment & { bytes: Buffer }>(
      'SELECT id,name,mime,size,bytes FROM chat_attachments WHERE id=$1 AND channel_id=$2 AND (message_id IS NOT NULL OR uploader_id=$3)',
      [attachmentId, channelId, userId],
    );
    if (!file) throw new HttpError(404, 'That attachment is not available.');
    return file;
  }

  async discard(userId: string, channelId: string, attachmentId: string): Promise<void> {
    await this.communities.channel(userId, channelId);
    await this.db.query(
      'DELETE FROM chat_attachments WHERE id=$1 AND channel_id=$2 AND uploader_id=$3 AND message_id IS NULL',
      [attachmentId, channelId, userId],
    );
  }

  async react(
    userId: string,
    channelId: string,
    messageId: string,
    emoji: string,
    add: boolean,
  ): Promise<ChatReaction[]> {
    if (!reactionEmojis.has(emoji)) throw new HttpError(400, 'Choose an emoji from the picker.');
    const { channel } = await this.communities.channel(userId, channelId);
    await withServer(this.db, userId, channel.serverId, async (db) => {
      await this.requireWriting(userId, channelId, db);
      const { rows } = await db.query('SELECT id FROM messages WHERE id=$1 AND channel_id=$2 FOR UPDATE', [
        messageId,
        channelId,
      ]);
      if (!rows.length) throw new HttpError(404, 'That message is not available.');
      if (add) {
        const {
          rows: [counts],
        } = await db.query<{ count: number; known: boolean }>(
          'SELECT count(DISTINCT emoji)::int AS count,COALESCE(bool_or(emoji=$2),false) AS known FROM message_reactions WHERE message_id=$1',
          [messageId, emoji],
        );
        if (counts.count >= 20 && !counts.known)
          throw new HttpError(400, 'This message already has 20 different reactions.');
        await db.query(
          'INSERT INTO message_reactions(message_id,account_id,emoji) VALUES($1,$2,$3) ON CONFLICT DO NOTHING',
          [messageId, userId, emoji],
        );
      } else
        await db.query('DELETE FROM message_reactions WHERE message_id=$1 AND account_id=$2 AND emoji=$3', [
          messageId,
          userId,
          emoji,
        ]);
    });
    return (
      await this.db.query<ChatReaction>(
        'SELECT emoji,count(*)::int AS count,bool_or(account_id=$2) AS mine FROM message_reactions WHERE message_id=$1 GROUP BY emoji ORDER BY emoji',
        [messageId, userId],
      )
    ).rows;
  }

  async resources(
    userId: string,
    channelId: string,
    kind: 'media' | 'links',
    before?: string,
  ): Promise<ChannelResources> {
    const { channel } = await this.communities.channel(userId, channelId);
    if (channel.type !== 'text') throw new HttpError(400, 'Choose a text channel.');
    if (kind === 'media') {
      const { rows } = await this.db.query<ChannelMedia>(
        `SELECT f.id,f.name,f.mime,f.size,f.message_id AS "messageId",a.display_name AS "authorName",f.created_at AS "createdAt"
        FROM chat_attachments f JOIN accounts a ON a.id=f.uploader_id WHERE f.channel_id=$1 AND f.message_id IS NOT NULL
        AND ($2::uuid IS NULL OR (f.created_at,f.id)<(SELECT created_at,id FROM chat_attachments WHERE id=$2 AND channel_id=$1))
        ORDER BY f.created_at DESC,f.id DESC LIMIT 25`,
        [channelId, before ?? null],
      );
      return { media: rows, links: [], nextBefore: rows.length === 25 ? rows.at(-1)!.id : undefined };
    }
    const { rows } = await this.db.query<ChatMessage>(
      `SELECT m.id,m.content,a.display_name AS "authorName",m.created_at AS "createdAt" FROM messages m JOIN accounts a ON a.id=m.author_id
      WHERE m.channel_id=$1 AND (m.content ILIKE '%http://%' OR m.content ILIKE '%https://%' OR m.content ILIKE '%www.%')
      AND ($2::uuid IS NULL OR (m.created_at,m.id)<(SELECT created_at,id FROM messages WHERE id=$2 AND channel_id=$1))
      ORDER BY m.created_at DESC,m.id DESC LIMIT 50`,
      [channelId, before ?? null],
    );
    return {
      media: [],
      links: rows.flatMap((message) =>
        messageLinks(message.content).map(({ url }) => ({
          url,
          messageId: message.id,
          authorName: message.authorName,
          createdAt: message.createdAt,
        })),
      ),
      nextBefore: rows.length === 50 ? rows.at(-1)!.id : undefined,
    };
  }

  private async requireWriting(userId: string, channelId: string, db: Database): Promise<void> {
    const { channel, permissions } = await this.communities.channel(userId, channelId, db);
    if (channel.type !== 'text' || !has(permissions, Permission.SendMessages))
      throw new HttpError(403, 'You cannot send messages or reactions in this channel.');
  }
}
