import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { Database } from './database.js';
import type { LiveHub } from './live-hub.js';
import type { PresenceSource } from './presence-service.js';

const uuid = z.uuid();
const reading = new Set(['GET', 'HEAD', 'OPTIONS']);

/** Routes whose effect is on a channel's messages, not on its server. */
const messageRoutes = new Set([
  '/api/channels/:channelId/messages',
  '/api/channels/:channelId/messages/:messageId',
  '/api/channels/:channelId/messages/:messageId/reactions',
]);
/** Routes that change nothing anybody else sees. */
const quietRoutes = new Set([
  '/api/channels/:channelId/attachments',
  '/api/channels/:channelId/attachments/:attachmentId',
  '/api/servers/:serverId/appearance-images',
  '/api/servers/:serverId/roles/:roleId/icon',
  '/api/servers/:serverId/invites',
  '/api/servers/:serverId/invites/:inviteId',
  '/api/servers/:serverId/welcome/ack',
]);
/** Changes to a person that everybody sharing a server with them sees. */
const profileRoutes = new Set([
  '/api/account/profile',
  '/api/account/avatar',
  '/api/account/banner',
  '/api/account/tag',
]);

interface ServerChange {
  serverId: string;
  /** Members before the change, who must hear about it even if it removed them. */
  before: string[];
}

/**
 * Tells the people concerned when a request changed something they can see.
 *
 * It watches the routes from the outside rather than living inside each one:
 * every change to a server goes through a route that names the server, a
 * channel, a category or a tag, so one rule covers routes that are added later.
 */
export function publishChanges(
  server: FastifyInstance,
  hub: LiveHub,
  db: Database,
  actorOf: (request: FastifyRequest) => { id: string; sessionId: string } | undefined,
): void {
  const pending = new WeakMap<FastifyRequest, ServerChange>();
  const membersOf = async (serverId: string) =>
    (
      await db.query<{ id: string }>('SELECT account_id AS id FROM memberships WHERE server_id=$1', [
        serverId,
      ])
    ).rows.map((row) => row.id);
  const serverOf = async (params: Record<string, string>): Promise<string | undefined> => {
    const lookup = async (sql: string, value?: string) => {
      if (!uuid.safeParse(value).success) return undefined;
      return (await db.query<{ id: string }>(sql, [value])).rows[0]?.id;
    };
    if (params.serverId) return uuid.safeParse(params.serverId).success ? params.serverId : undefined;
    if (params.channelId)
      return lookup('SELECT server_id AS id FROM channels WHERE id=$1', params.channelId);
    if (params.categoryId)
      return lookup('SELECT server_id AS id FROM categories WHERE id=$1', params.categoryId);
    if (params.tagId) return lookup('SELECT server_id AS id FROM server_tags WHERE id=$1', params.tagId);
    return undefined;
  };
  const serverChanged = async (serverId: string, also: Iterable<string> = []) => {
    const people = new Set([...(await membersOf(serverId)), ...also]);
    hub.toAccounts(people, { type: 'server', serverId });
    // A role or an override may have shut somebody out of a channel they watch.
    await hub.recheck(people);
  };
  const conversation = async (conversationId: string) =>
    (
      await db.query<{ first: string; second: string }>(
        'SELECT first_id AS first, second_id AS second FROM direct_conversations WHERE id=$1',
        [conversationId],
      )
    ).rows[0];

  // Before the change: who is in the server now, while a deleted one still exists.
  server.addHook('preHandler', async (request) => {
    if (reading.has(request.method) || !hub.size) return;
    const route = request.routeOptions.url ?? '';
    if (messageRoutes.has(route) || quietRoutes.has(route)) return;
    const serverId = await serverOf(request.params as Record<string, string>);
    if (serverId) pending.set(request, { serverId, before: await membersOf(serverId) });
  });

  server.addHook('onResponse', async (request, reply) => {
    if (reading.has(request.method) || reply.statusCode >= 400 || !hub.size) return;
    const route = request.routeOptions.url ?? '';
    const params = request.params as Record<string, string>;
    const actor = actorOf(request);
    try {
      if (messageRoutes.has(route)) {
        const written = request.method === 'POST' && route === '/api/channels/:channelId/messages';
        hub.toChannel(params.channelId, {
          type: 'channel',
          channelId: params.channelId,
          ...(written && actor ? { authorId: actor.id } : {}),
        });
        return;
      }
      const change = pending.get(request);
      if (change) {
        const also = [...change.before, ...(params.userId ? [params.userId] : [])];
        await serverChanged(change.serverId, also);
        if (route === '/api/servers/:serverId/invites/direct') await directsAfterInvite(request);
        return;
      }
      if (!actor) return;
      if (route === '/api/auth/logout') {
        hub.closeSession(actor.sessionId);
        return;
      }
      if (route === '/api/servers' || route === '/api/invites/join') {
        hub.toAccounts([actor.id], { type: 'servers' });
        if (route === '/api/invites/join') {
          // Joining is news to everybody already there.
          const {
            rows: [joined],
          } = await db.query<{ id: string }>(
            'SELECT server_id AS id FROM memberships WHERE account_id=$1 ORDER BY joined_at DESC NULLS LAST LIMIT 1',
            [actor.id],
          );
          if (joined) await serverChanged(joined.id);
        }
        return;
      }
      if (profileRoutes.has(route)) {
        const { rows } = await db.query<{ id: string }>(
          'SELECT server_id AS id FROM memberships WHERE account_id=$1',
          [actor.id],
        );
        for (const row of rows) hub.toAccounts(await membersOf(row.id), { type: 'server', serverId: row.id });
        return;
      }
      if (route === '/api/directs') {
        const username = (request.body as { username?: string } | undefined)?.username?.trim();
        const peer = username
          ? (
              await db.query<{ id: string }>('SELECT id FROM accounts WHERE username=$1', [username])
            ).rows[0]?.id
          : undefined;
        hub.toAccounts([actor.id, ...(peer ? [peer] : [])], { type: 'directs' });
        return;
      }
      if (route.startsWith('/api/directs/:conversationId/')) {
        const conversationId = params.conversationId;
        if (route.endsWith('/read')) {
          hub.toAccounts([actor.id], { type: 'directs' });
          return;
        }
        const people = await conversation(conversationId);
        if (people)
          hub.toAccounts([people.first, people.second], {
            type: 'directs',
            conversationId,
            ...(route.endsWith('/messages') ? { authorId: actor.id } : {}),
          });
        return;
      }
      if (route.startsWith('/api/direct-invites/:inviteId/')) {
        const {
          rows: [invite],
        } = await db.query<{ serverId: string; inviter: string; invitee: string; conversationId?: string }>(
          `SELECT i.server_id AS "serverId", i.inviter_id AS inviter, i.invitee_id AS invitee,
            (SELECT conversation_id FROM direct_messages WHERE invite_id=i.id LIMIT 1) AS "conversationId"
          FROM direct_invites i WHERE i.id=$1`,
          [params.inviteId],
        );
        if (!invite) return;
        hub.toAccounts([invite.inviter, invite.invitee], {
          type: 'directs',
          ...(invite.conversationId ? { conversationId: invite.conversationId } : {}),
        });
        if (route.endsWith('/accept')) {
          hub.toAccounts([invite.invitee], { type: 'servers' });
          await serverChanged(invite.serverId, [invite.invitee]);
        }
      }
    } catch (error) {
      request.log.warn({ code: (error as { code?: string }).code }, 'Live event failed');
    }
  });

  async function directsAfterInvite(request: FastifyRequest) {
    const actor = actorOf(request);
    const username = (request.body as { username?: string } | undefined)?.username?.trim();
    if (!actor || !username) return;
    const peer = (
      await db.query<{ id: string }>('SELECT id FROM accounts WHERE username=$1', [username])
    ).rows[0]?.id;
    hub.toAccounts([actor.id, ...(peer ? [peer] : [])], { type: 'directs' });
  }
}

/**
 * Watches who sits in the voice rooms and says which servers changed.
 *
 * Every open application used to ask this on its own timer. Now the server
 * asks LiveKit once, on one timer, and only while somebody is connected.
 */
export function watchPresence(
  server: FastifyInstance,
  hub: LiveHub,
  db: Database,
  source: PresenceSource,
  everyMs = 2_000,
): void {
  let known: Map<string, string> | undefined;
  let busy = false;
  const look = async () => {
    if (busy) return;
    if (!hub.size) {
      // Nobody to tell; start from scratch when somebody connects.
      known = undefined;
      return;
    }
    busy = true;
    try {
      const rooms = await source.read();
      const now = new Map(
        rooms.map((room) => [
          room.roomId,
          room.occupants
            .map((occupant) => occupant.identity)
            .sort()
            .join(','),
        ]),
      );
      const before = known;
      known = now;
      if (!before) return;
      const changed = new Set<string>();
      for (const [roomId, people] of now) if (before.get(roomId) !== people) changed.add(roomId);
      for (const [roomId, people] of before) if (!now.has(roomId) && people) changed.add(roomId);
      const channelIds = [...changed]
        .map((roomId) => roomId.replace(/^channel_/, ''))
        .filter((id) => uuid.safeParse(id).success);
      if (!channelIds.length) return;
      const { rows } = await db.query<{ serverId: string; accountId: string }>(
        `SELECT DISTINCT m.server_id AS "serverId", m.account_id AS "accountId"
        FROM channels c JOIN memberships m ON m.server_id=c.server_id
        WHERE c.id=ANY($1::uuid[])`,
        [channelIds],
      );
      const byServer = new Map<string, string[]>();
      for (const row of rows) byServer.set(row.serverId, [...(byServer.get(row.serverId) ?? []), row.accountId]);
      for (const [serverId, people] of byServer) hub.toAccounts(people, { type: 'presence', serverId });
    } catch {
      // LiveKit unreachable for a moment: the clients' slow timer covers it.
    } finally {
      busy = false;
    }
  };
  let timer: ReturnType<typeof setInterval> | undefined;
  server.addHook('onListen', async () => {
    timer = setInterval(() => void look(), everyMs);
    timer.unref();
  });
  server.addHook('onClose', async () => {
    if (timer) clearInterval(timer);
  });
}
