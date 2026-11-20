import { randomUUID } from 'node:crypto';
import type {
  DirectConversation,
  DirectProfile,
  DirectInvite,
  DirectInviteStatus,
  DirectMessage,
} from '../src/shared/community.js';
import { Permission } from '../src/shared/permissions.js';
import { requirePermission, withServer } from './access.js';
import { admitMember } from './community-service.js';
import type { Database } from './database.js';
import { profileColumns, profileJoins, toAccount, type ProfileRow } from './profile.js';
import { HttpError } from './security.js';

/** How long an invitation sent as a message stays open. */
export const directInviteDays = 7;
const page = 50;

interface PeerRow {
  id: string;
  username: string;
  displayName: string;
  avatarId: string | null;
}

interface MessageRow {
  id: string;
  conversationId: string;
  authorId: string;
  content: string;
  createdAt: string;
  kind: 'text' | 'invite';
  inviteId: string | null;
  status: Exclude<DirectInviteStatus, 'expired'> | null;
  expiresAt: string | null;
  serverId: string | null;
  serverName: string | null;
  serverIconId: string | null;
  memberCount: number | null;
  inviterId: string | null;
  inviteeId: string | null;
}

const messageSelect = `SELECT m.id, m.conversation_id AS "conversationId", m.author_id AS "authorId",
  m.content, m.created_at AS "createdAt", m.kind,
  i.id AS "inviteId", i.status, i.expires_at AS "expiresAt", i.server_id AS "serverId",
  s.name AS "serverName", s.icon_id AS "serverIconId", i.inviter_id AS "inviterId", i.invitee_id AS "inviteeId",
  (SELECT count(*)::int FROM memberships ms WHERE ms.server_id = i.server_id) AS "memberCount"
  FROM direct_messages m
  LEFT JOIN direct_invites i ON i.id = m.invite_id
  LEFT JOIN communities s ON s.id = i.server_id`;

function toMessage(row: MessageRow): DirectMessage {
  const invite: DirectInvite | undefined =
    row.inviteId && row.serverId
      ? {
          id: row.inviteId,
          status:
            row.status === 'pending' && new Date(row.expiresAt!).getTime() <= Date.now()
              ? 'expired'
              : row.status!,
          serverId: row.serverId,
          serverName: row.serverName ?? 'A server',
          serverIconId: row.serverIconId,
          memberCount: row.memberCount ?? 0,
          inviterId: row.inviterId!,
          inviteeId: row.inviteeId!,
          expiresAt: new Date(row.expiresAt!).toISOString(),
        }
      : undefined;
  return {
    id: row.id,
    conversationId: row.conversationId,
    authorId: row.authorId,
    content: row.content,
    createdAt: new Date(row.createdAt).toISOString(),
    kind: row.kind,
    ...(invite ? { invite } : {}),
  };
}

/**
 * One-to-one conversations, and invitations to a server delivered as a message
 * in one. Anyone can be written to by their exact username, which is also how
 * somebody outside every shared server is found to be invited.
 */
export class DirectService {
  constructor(private readonly db: Database) {}

  private async accountByUsername(db: Database, username: string): Promise<PeerRow> {
    const {
      rows: [peer],
    } = await db.query<PeerRow>(
      `SELECT id, username, display_name AS "displayName", avatar_id AS "avatarId"
      FROM accounts WHERE username=$1`,
      [username.trim().toLowerCase()],
    );
    if (!peer) throw new HttpError(404, 'Nobody goes by that username.');
    return peer;
  }

  /** The conversation between two accounts, made the first time it is needed. */
  private async between(db: Database, userId: string, peerId: string): Promise<string> {
    if (userId === peerId) throw new HttpError(400, 'You cannot message yourself.');
    await db.query(
      `INSERT INTO direct_conversations(id, first_id, second_id, opened_by)
      VALUES($1, LEAST($2::uuid, $3::uuid), GREATEST($2::uuid, $3::uuid), $2)
      ON CONFLICT (first_id, second_id) DO NOTHING`,
      [randomUUID(), userId, peerId],
    );
    const {
      rows: [conversation],
    } = await db.query<{ id: string }>(
      `SELECT id FROM direct_conversations
      WHERE first_id = LEAST($1::uuid, $2::uuid) AND second_id = GREATEST($1::uuid, $2::uuid)`,
      [userId, peerId],
    );
    return conversation.id;
  }

  /** The conversation, if this account is one of its two people. */
  private async participant(db: Database, userId: string, conversationId: string): Promise<void> {
    const found = await db.query(
      'SELECT 1 FROM direct_conversations WHERE id=$1 AND (first_id=$2 OR second_id=$2)',
      [conversationId, userId],
    );
    if (!found.rows.length) throw new HttpError(404, 'That conversation does not exist.');
  }

  private async insertMessage(
    db: Database,
    conversationId: string,
    authorId: string,
    content: string,
    inviteId?: string,
  ): Promise<DirectMessage> {
    const id = randomUUID();
    await db.query(
      `INSERT INTO direct_messages(id, conversation_id, author_id, kind, content, invite_id)
      VALUES($1,$2,$3,$4,$5,$6)`,
      [id, conversationId, authorId, inviteId ? 'invite' : 'text', content, inviteId ?? null],
    );
    // Writing in a conversation is also having read it.
    await db.query(
      `UPDATE direct_conversations SET last_message_at = now(),
        first_read_at = CASE WHEN first_id = $2 THEN now() ELSE first_read_at END,
        second_read_at = CASE WHEN second_id = $2 THEN now() ELSE second_read_at END
      WHERE id = $1`,
      [conversationId, authorId],
    );
    const {
      rows: [row],
    } = await db.query<MessageRow>(`${messageSelect} WHERE m.id=$1`, [id]);
    return toMessage(row);
  }

  /**
   * Conversations newest first. One the other person opened but has not
   * written in yet stays out of the list until they do; asked for by id, it
   * is returned regardless.
   */
  async list(userId: string, conversationId?: string): Promise<DirectConversation[]> {
    const { rows } = await this.db.query<
      PeerRow & {
        conversationId: string;
        updatedAt: string;
        lastContent: string | null;
        lastAuthorId: string | null;
        lastAt: string | null;
        lastInvite: boolean | null;
        unread: number;
      }
    >(
      `SELECT c.id AS "conversationId", c.last_message_at AS "updatedAt",
        p.id, p.username, p.display_name AS "displayName", p.avatar_id AS "avatarId",
        lm.content AS "lastContent", lm.author_id AS "lastAuthorId", lm.created_at AS "lastAt",
        (lm.kind = 'invite') AS "lastInvite",
        (SELECT count(*)::int FROM direct_messages m WHERE m.conversation_id = c.id AND m.author_id <> $1
          AND m.created_at > CASE WHEN c.first_id = $1 THEN c.first_read_at ELSE c.second_read_at END) AS unread
      FROM direct_conversations c
      JOIN accounts p ON p.id = CASE WHEN c.first_id = $1 THEN c.second_id ELSE c.first_id END
      LEFT JOIN LATERAL (
        SELECT content, author_id, created_at, kind FROM direct_messages
        WHERE conversation_id = c.id ORDER BY created_at DESC, id DESC LIMIT 1
      ) lm ON true
      WHERE (c.first_id = $1 OR c.second_id = $1)
        AND ($2::uuid IS NULL OR c.id = $2)
        AND ($2::uuid IS NOT NULL OR lm.created_at IS NOT NULL OR c.opened_by = $1)
      ORDER BY c.last_message_at DESC LIMIT 100`,
      [userId, conversationId ?? null],
    );
    return rows.map((row) => ({
      id: row.conversationId,
      peer: { id: row.id, username: row.username, displayName: row.displayName, avatarId: row.avatarId },
      ...(row.lastAt
        ? {
            lastMessage: {
              content: row.lastContent ?? '',
              authorId: row.lastAuthorId!,
              createdAt: new Date(row.lastAt).toISOString(),
              invite: Boolean(row.lastInvite),
            },
          }
        : {}),
      unread: row.unread,
      updatedAt: new Date(row.updatedAt).toISOString(),
    }));
  }

  /** Opens (or finds) the conversation with somebody, by their username. */
  async open(userId: string, username: string): Promise<DirectConversation> {
    const conversationId = await this.db.transaction(async (db) => {
      const peer = await this.accountByUsername(db, username);
      return this.between(db, userId, peer.id);
    });
    const [found] = await this.list(userId, conversationId);
    return found;
  }

  async messages(userId: string, conversationId: string, before?: string): Promise<DirectMessage[]> {
    await this.participant(this.db, userId, conversationId);
    const { rows } = await this.db.query<MessageRow>(
      `${messageSelect} WHERE m.conversation_id=$1 AND ($2::uuid IS NULL OR (m.created_at, m.id) <
        (SELECT created_at, id FROM direct_messages WHERE id=$2 AND conversation_id=$1))
      ORDER BY m.created_at DESC, m.id DESC LIMIT ${page}`,
      [conversationId, before ?? null],
    );
    return rows.reverse().map(toMessage);
  }

  async send(userId: string, conversationId: string, content: string): Promise<DirectMessage> {
    const text = content.trim();
    if (!text) throw new HttpError(400, 'Write something first.');
    return this.db.transaction(async (db) => {
      await this.participant(db, userId, conversationId);
      return this.insertMessage(db, conversationId, userId, text);
    });
  }

  /**
   * The other person's profile, for somebody in a conversation with them,
   * and the servers the two share. No server tag: there is no server here.
   */
  async profile(userId: string, conversationId: string): Promise<DirectProfile> {
    const {
      rows: [conversation],
    } = await this.db.query<{ peerId: string }>(
      `SELECT CASE WHEN first_id=$2 THEN second_id ELSE first_id END AS "peerId"
      FROM direct_conversations WHERE id=$1 AND (first_id=$2 OR second_id=$2)`,
      [conversationId, userId],
    );
    if (!conversation) throw new HttpError(404, 'That conversation does not exist.');
    const {
      rows: [row],
    } = await this.db.query<ProfileRow>(
      `SELECT ${profileColumns} FROM accounts a ${profileJoins()} WHERE a.id=$1`,
      [conversation.peerId],
    );
    if (!row) throw new HttpError(404, 'That account no longer exists.');
    const { rows: mutualServers } = await this.db.query<{ id: string; name: string; iconId: string | null }>(
      `SELECT c.id, c.name, c.icon_id AS "iconId" FROM memberships mine
      JOIN memberships theirs ON theirs.server_id = mine.server_id AND theirs.account_id = $2
      JOIN communities c ON c.id = mine.server_id
      WHERE mine.account_id = $1 ORDER BY c.name LIMIT 12`,
      [userId, conversation.peerId],
    );
    return { account: toAccount(row), mutualServers };
  }

  async read(userId: string, conversationId: string): Promise<void> {
    await this.participant(this.db, userId, conversationId);
    await this.db.query(
      `UPDATE direct_conversations SET
        first_read_at = CASE WHEN first_id = $2 THEN now() ELSE first_read_at END,
        second_read_at = CASE WHEN second_id = $2 THEN now() ELSE second_read_at END
      WHERE id = $1`,
      [conversationId, userId],
    );
  }

  /**
   * Invites somebody to a server by sending it to them as a message. A newer
   * invitation replaces an older one still waiting, so the card they act on is
   * always the live one.
   */
  async inviteToServer(
    userId: string,
    serverId: string,
    username: string,
    note: string,
  ): Promise<{ conversationId: string; message: DirectMessage }> {
    return withServer(this.db, userId, serverId, async (db, access) => {
      requirePermission(access, Permission.CreateInvites, 'You need Create invitations to invite people.');
      const peer = await this.accountByUsername(db, username);
      if (peer.id === userId) throw new HttpError(400, 'You are already in this server.');
      const member = await db.query('SELECT 1 FROM memberships WHERE server_id=$1 AND account_id=$2', [
        serverId,
        peer.id,
      ]);
      if (member.rows.length) throw new HttpError(409, `${peer.displayName} is already in this server.`);
      const banned = await db.query('SELECT 1 FROM bans WHERE server_id=$1 AND account_id=$2', [
        serverId,
        peer.id,
      ]);
      if (banned.rows.length) throw new HttpError(409, `${peer.displayName} is banned from this server.`);
      await db.query(
        `UPDATE direct_invites SET status='revoked', responded_at=now()
        WHERE server_id=$1 AND invitee_id=$2 AND status='pending'`,
        [serverId, peer.id],
      );
      const inviteId = randomUUID();
      await db.query(
        `INSERT INTO direct_invites(id, server_id, inviter_id, invitee_id, expires_at)
        VALUES($1,$2,$3,$4, now() + interval '${directInviteDays} days')`,
        [inviteId, serverId, userId, peer.id],
      );
      const conversationId = await this.between(db, userId, peer.id);
      const message = await this.insertMessage(db, conversationId, userId, note.trim(), inviteId);
      return { conversationId, message };
    });
  }

  /** The invited person accepts or declines. Accepting makes them a member. */
  async respond(userId: string, inviteId: string, accept: boolean): Promise<{ serverId: string }> {
    return this.db.transaction(async (db) => {
      const {
        rows: [lookup],
      } = await db.query<{ serverId: string }>(
        'SELECT server_id AS "serverId" FROM direct_invites WHERE id=$1 AND invitee_id=$2',
        [inviteId, userId],
      );
      if (!lookup) throw new HttpError(404, 'That invitation does not exist.');
      // The same lock order as every other write to a server.
      await db.query('SELECT id FROM communities WHERE id=$1 FOR UPDATE', [lookup.serverId]);
      const {
        rows: [invite],
      } = await db.query<{ status: string; expired: boolean }>(
        'SELECT status, expires_at <= now() AS expired FROM direct_invites WHERE id=$1 FOR UPDATE',
        [inviteId],
      );
      if (invite.status !== 'pending') {
        throw new HttpError(
          invite.status === 'revoked' ? 410 : 409,
          invite.status === 'revoked'
            ? 'This invitation was withdrawn.'
            : 'You already answered this invitation.',
        );
      }
      if (invite.expired) throw new HttpError(410, 'This invitation has expired.');
      if (accept) await admitMember(db, lookup.serverId, userId);
      await db.query('UPDATE direct_invites SET status=$2, responded_at=now() WHERE id=$1', [
        inviteId,
        accept ? 'accepted' : 'declined',
      ]);
      return { serverId: lookup.serverId };
    });
  }

  /** Whoever sent an invitation can take it back while it is still waiting. */
  async revoke(userId: string, inviteId: string): Promise<void> {
    const { rows } = await this.db.query(
      `UPDATE direct_invites SET status='revoked', responded_at=now()
      WHERE id=$1 AND inviter_id=$2 AND status='pending' RETURNING id`,
      [inviteId, userId],
    );
    if (!rows.length) throw new HttpError(409, 'Only a waiting invitation you sent can be withdrawn.');
  }
}
