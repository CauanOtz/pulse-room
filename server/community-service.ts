import { randomUUID } from 'node:crypto';
import type {
  ChatMessage,
  Community,
  CommunityChannel,
  CommunityDetail,
  CommunityInvite,
  CommunityMember,
  MemberRole,
} from '../src/shared/community.js';
import { canManage } from '../src/shared/community.js';
import type { Database } from './database.js';
import { digest, HttpError, opaqueToken } from './security.js';

export type ChannelInput = Omit<CommunityChannel, 'id' | 'serverId'>;
const channelColumns = `c.id, c.server_id AS "serverId", c.name, c.type, c.private,
  c.allow_speak AS "allowSpeak", c.allow_share AS "allowShare", c.read_only AS "readOnly"`;

/** Policy checks live beside repository operations, never in renderer-only code. */
export class CommunityService {
  constructor(private readonly db: Database) {}

  async list(userId: string): Promise<Community[]> {
    return (
      await this.db.query<Community>(
        `SELECT c.id,c.name,c.icon_id AS "iconId",m.role FROM communities c
      JOIN memberships m ON m.server_id=c.id WHERE m.account_id=$1 ORDER BY c.created_at,c.id`,
        [userId],
      )
    ).rows;
  }

  async role(userId: string, serverId: string, db = this.db): Promise<MemberRole> {
    const {
      rows: [member],
    } = await db.query<{ role: MemberRole }>(
      'SELECT role FROM memberships WHERE server_id=$1 AND account_id=$2',
      [serverId, userId],
    );
    if (!member) throw new HttpError(404, 'Server not found or access denied.');
    return member.role;
  }

  async create(userId: string, name: string): Promise<Community> {
    return this.db.transaction(async (db) => {
      await db.query('SELECT id FROM accounts WHERE id=$1 FOR UPDATE', [userId]);
      const {
        rows: [count],
      } = await db.query<{ count: string }>(
        "SELECT count(*) FROM memberships WHERE account_id=$1 AND role='owner'",
        [userId],
      );
      if (Number(count.count) >= 10) throw new HttpError(409, 'You can own up to 10 servers.');
      const id = randomUUID();
      await db.query('INSERT INTO communities(id,name) VALUES($1,$2)', [id, name]);
      await db.query("INSERT INTO memberships(server_id,account_id,role) VALUES($1,$2,'owner')", [
        id,
        userId,
      ]);
      for (const [channelName, type] of [
        ['general', 'text'],
        ['Lounge', 'voice'],
      ]) {
        await db.query('INSERT INTO channels(id,server_id,name,type) VALUES($1,$2,$3,$4)', [
          randomUUID(),
          id,
          channelName,
          type,
        ]);
      }
      return { id, name, role: 'owner' };
    });
  }

  async detail(userId: string, serverId: string): Promise<CommunityDetail> {
    const role = await this.role(userId, serverId);
    const {
      rows: [server],
    } = await this.db.query<{ id: string; name: string; iconId: string | null }>(
      'SELECT id,name,icon_id AS "iconId" FROM communities WHERE id=$1',
      [serverId],
    );
    const { rows: channels } = await this.db.query<CommunityChannel>(
      `SELECT ${channelColumns} FROM channels c
      WHERE c.server_id=$1 AND (NOT c.private OR $3 OR EXISTS(
        SELECT 1 FROM channel_members cm WHERE cm.channel_id=c.id AND cm.account_id=$2))
      ORDER BY c.created_at,c.id`,
      [serverId, userId, canManage(role)],
    );
    for (const channel of channels)
      channel.memberIds = canManage(role)
        ? (
            await this.db.query<{ id: string }>(
              'SELECT account_id AS id FROM channel_members WHERE channel_id=$1',
              [channel.id],
            )
          ).rows.map((x) => x.id)
        : [];
    const { rows: members } = await this.db.query<CommunityMember>(
      `SELECT a.id,a.username,a.display_name AS "displayName",a.avatar_id AS "avatarId",m.role
      FROM accounts a JOIN memberships m ON a.id=m.account_id WHERE m.server_id=$1 ORDER BY a.username`,
      [serverId],
    );
    return { server: { ...server, role }, channels, members };
  }

  async channel(
    userId: string,
    channelId: string,
    db = this.db,
  ): Promise<{ channel: CommunityChannel; role: MemberRole }> {
    const {
      rows: [channel],
    } = await db.query<CommunityChannel>(`SELECT ${channelColumns} FROM channels c WHERE c.id=$1`, [
      channelId,
    ]);
    if (!channel) throw new HttpError(404, 'Channel not found or access denied.');
    const role = await this.role(userId, channel.serverId, db);
    const { rows } = await db.query<{ id: string }>(
      'SELECT account_id AS id FROM channel_members WHERE channel_id=$1',
      [channelId],
    );
    channel.memberIds = rows.map((row) => row.id);
    if (channel.private && !canManage(role) && !channel.memberIds.includes(userId))
      throw new HttpError(404, 'Channel not found or access denied.');
    return { channel, role };
  }

  private async mutate<T>(
    userId: string,
    serverId: string,
    action: (db: Database, role: MemberRole) => Promise<T>,
  ): Promise<T> {
    return this.db.transaction(async (db) => {
      await db.query('SELECT id FROM communities WHERE id=$1 FOR UPDATE', [serverId]);
      return action(db, await this.role(userId, serverId, db));
    });
  }
  private requireManager(role: MemberRole): void {
    if (!canManage(role)) throw new HttpError(403, 'Only the owner and administrators can do that.');
  }

  /** Only a manager changes the icon, and the replaced one is dropped. */
  async setIcon(
    userId: string,
    serverId: string,
    imageId: string | null,
    images: { collect(id: string | null | undefined, db?: Database): Promise<void> },
  ): Promise<void> {
    await this.mutate(userId, serverId, async (db, role) => {
      this.requireManager(role);
      const {
        rows: [current],
      } = await db.query<{ iconId: string | null }>(
        'SELECT icon_id AS "iconId" FROM communities WHERE id=$1',
        [serverId],
      );
      await db.query('UPDATE communities SET icon_id=$2 WHERE id=$1', [serverId, imageId]);
      if (current?.iconId && current.iconId !== imageId) await images.collect(current.iconId, db);
    });
  }

  async rename(userId: string, serverId: string, name: string): Promise<void> {
    await this.mutate(userId, serverId, async (db, role) => {
      this.requireManager(role);
      await db.query('UPDATE communities SET name=$1 WHERE id=$2', [name, serverId]);
    });
  }

  async deleteServer(userId: string, serverId: string): Promise<void> {
    await this.mutate(userId, serverId, async (db, role) => {
      if (role !== 'owner') throw new HttpError(403, 'Only the owner can delete a server.');
      await db.query('DELETE FROM communities WHERE id=$1', [serverId]);
    });
  }

  async setMember(
    userId: string,
    serverId: string,
    targetId: string,
    nextRole: 'admin' | 'member' | null,
  ): Promise<void> {
    await this.mutate(userId, serverId, async (db, role) => {
      const targetRole = await this.role(targetId, serverId, db);
      if (targetRole === 'owner')
        throw new HttpError(403, 'The owner must transfer ownership or delete the server before leaving.');
      const leaving = userId === targetId && nextRole === null;
      if (!leaving && role !== 'owner' && (role !== 'admin' || targetRole !== 'member' || nextRole !== null))
        throw new HttpError(403, 'You cannot change this member.');
      if (nextRole)
        await db.query('UPDATE memberships SET role=$1 WHERE server_id=$2 AND account_id=$3', [
          nextRole,
          serverId,
          targetId,
        ]);
      else {
        await db.query(
          'DELETE FROM channel_members WHERE account_id=$1 AND channel_id IN(SELECT id FROM channels WHERE server_id=$2)',
          [targetId, serverId],
        );
        await db.query('DELETE FROM memberships WHERE server_id=$1 AND account_id=$2', [serverId, targetId]);
      }
    });
  }

  async transfer(userId: string, serverId: string, targetId: string): Promise<void> {
    await this.mutate(userId, serverId, async (db, role) => {
      if (role !== 'owner' || userId === targetId)
        throw new HttpError(403, 'Choose another member to become owner.');
      await this.role(targetId, serverId, db);
      await db.query("UPDATE memberships SET role='admin' WHERE server_id=$1 AND account_id=$2", [
        serverId,
        userId,
      ]);
      await db.query("UPDATE memberships SET role='owner' WHERE server_id=$1 AND account_id=$2", [
        serverId,
        targetId,
      ]);
    });
  }

  async saveChannel(
    userId: string,
    serverId: string,
    input: ChannelInput,
    channelId?: string,
  ): Promise<string> {
    return this.mutate(userId, serverId, async (db, role) => {
      this.requireManager(role);
      const existing = channelId ? (await this.channel(userId, channelId, db)).channel : undefined;
      if (existing && (existing.serverId !== serverId || existing.type !== input.type))
        throw new HttpError(400, 'A channel cannot change server or type.');
      const { rows: members } = await db.query<{ id: string }>(
        'SELECT account_id AS id FROM memberships WHERE server_id=$1',
        [serverId],
      );
      if (input.memberIds.some((id) => !members.some((member) => member.id === id)))
        throw new HttpError(400, 'Private channel members must belong to this server.');
      if (!channelId) {
        const {
          rows: [count],
        } = await db.query<{ count: string }>('SELECT count(*) FROM channels WHERE server_id=$1', [serverId]);
        if (Number(count.count) >= 50) throw new HttpError(409, 'A server can have up to 50 channels.');
      }
      const id = channelId ?? randomUUID();
      await db.query(
        `INSERT INTO channels(id,server_id,name,type,private,allow_speak,allow_share,read_only)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(id) DO UPDATE SET
        name=EXCLUDED.name,private=EXCLUDED.private,allow_speak=EXCLUDED.allow_speak,
        allow_share=EXCLUDED.allow_share,read_only=EXCLUDED.read_only`,
        [
          id,
          serverId,
          input.name,
          input.type,
          input.private,
          input.allowSpeak,
          input.allowShare,
          input.readOnly,
        ],
      );
      await db.query('DELETE FROM channel_members WHERE channel_id=$1', [id]);
      for (const accountId of new Set(input.memberIds))
        await db.query('INSERT INTO channel_members(channel_id,account_id) VALUES($1,$2)', [id, accountId]);
      return id;
    });
  }

  async deleteChannel(userId: string, channelId: string): Promise<void> {
    const { channel } = await this.channel(userId, channelId);
    await this.mutate(userId, channel.serverId, async (db, role) => {
      this.requireManager(role);
      await db.query('DELETE FROM channels WHERE id=$1', [channelId]);
    });
  }

  async invite(userId: string, serverId: string, maxUses: number, hours: number): Promise<{ code: string }> {
    return this.mutate(userId, serverId, async (db, role) => {
      this.requireManager(role);
      const code = opaqueToken();
      await db.query(
        'INSERT INTO invitations(id,server_id,code_hash,expires_at,max_uses) VALUES($1,$2,$3,$4,$5)',
        [randomUUID(), serverId, digest(code), new Date(Date.now() + hours * 3600_000), maxUses],
      );
      return { code };
    });
  }

  async invites(userId: string, serverId: string): Promise<CommunityInvite[]> {
    this.requireManager(await this.role(userId, serverId));
    return (
      await this.db.query<CommunityInvite>(
        `SELECT id,expires_at AS "expiresAt",uses,max_uses AS "maxUses"
      FROM invitations WHERE server_id=$1 AND NOT revoked AND expires_at>now() AND uses<max_uses ORDER BY expires_at`,
        [serverId],
      )
    ).rows;
  }
  async revokeInvite(userId: string, serverId: string, inviteId: string): Promise<void> {
    await this.mutate(userId, serverId, async (db, role) => {
      this.requireManager(role);
      await db.query('UPDATE invitations SET revoked=true WHERE id=$1 AND server_id=$2', [
        inviteId,
        serverId,
      ]);
    });
  }

  async join(userId: string, code: string): Promise<{ serverId: string }> {
    return this.db.transaction(async (db) => {
      // Same lock order as manager mutations, then consume atomically.
      const {
        rows: [lookup],
      } = await db.query<{ serverId: string }>(
        'SELECT server_id AS "serverId" FROM invitations WHERE code_hash=$1',
        [digest(code)],
      );
      if (!lookup) throw new HttpError(404, 'Invite is invalid or expired.');
      await db.query('SELECT id FROM communities WHERE id=$1 FOR UPDATE', [lookup.serverId]);
      const {
        rows: [invite],
      } = await db.query<{ id: string; serverId: string }>(
        `SELECT id,server_id AS "serverId" FROM invitations
        WHERE code_hash=$1 AND NOT revoked AND expires_at>now() AND uses<max_uses FOR UPDATE`,
        [digest(code)],
      );
      if (!invite) throw new HttpError(404, 'Invite is invalid or expired.');
      const existing = await db.query('SELECT 1 FROM memberships WHERE server_id=$1 AND account_id=$2', [
        invite.serverId,
        userId,
      ]);
      if (!existing.rows.length) {
        const {
          rows: [count],
        } = await db.query<{ count: string }>('SELECT count(*) FROM memberships WHERE server_id=$1', [
          invite.serverId,
        ]);
        if (Number(count.count) >= 100)
          throw new HttpError(409, 'This server has reached its 100-member limit.');
        await db.query("INSERT INTO memberships(server_id,account_id,role) VALUES($1,$2,'member')", [
          invite.serverId,
          userId,
        ]);
        await db.query('UPDATE invitations SET uses=uses+1 WHERE id=$1', [invite.id]);
      }
      return { serverId: invite.serverId };
    });
  }

  async messages(userId: string, channelId: string, before?: string): Promise<ChatMessage[]> {
    const { channel } = await this.channel(userId, channelId);
    if (channel.type !== 'text') throw new HttpError(400, 'Messages belong to text channels.');
    return (
      await this.db.query<ChatMessage>(
        `SELECT m.id,m.channel_id AS "channelId",m.author_id AS "authorId",
      a.display_name AS "authorName",m.content,m.created_at AS "createdAt" FROM messages m JOIN accounts a ON a.id=m.author_id
      WHERE m.channel_id=$1 AND ($2::uuid IS NULL OR (m.created_at,m.id)<(
        SELECT created_at,id FROM messages WHERE id=$2 AND channel_id=$1))
      ORDER BY m.created_at DESC,m.id DESC LIMIT 50`,
        [channelId, before ?? null],
      )
    ).rows.reverse();
  }

  async sendMessage(userId: string, channelId: string, content: string): Promise<void> {
    const { channel } = await this.channel(userId, channelId);
    await this.mutate(userId, channel.serverId, async (db) => {
      const { channel: current, role } = await this.channel(userId, channelId, db);
      if (current.type !== 'text' || (current.readOnly && !canManage(role)))
        throw new HttpError(403, 'You cannot send messages in this channel.');
      await db.query('INSERT INTO messages(id,channel_id,author_id,content) VALUES($1,$2,$3,$4)', [
        randomUUID(),
        channelId,
        userId,
        content,
      ]);
    });
  }
  async deleteMessage(userId: string, channelId: string, messageId: string): Promise<void> {
    const { role } = await this.channel(userId, channelId);
    await this.db.query('DELETE FROM messages WHERE id=$1 AND channel_id=$2 AND (author_id=$3 OR $4)', [
      messageId,
      channelId,
      userId,
      canManage(role),
    ]);
  }
}
