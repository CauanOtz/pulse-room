import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import Fastify, { type FastifyInstance, type FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { ServerConfiguration } from './config.js';
import { LiveKitPresenceSource, type PresenceSource } from './presence-service.js';
import { TokenService } from './token-service.js';
import { PostgresDatabase, migrate, type Database } from './database.js';
import { AccountService, type AuthenticatedAccount } from './account-service.js';
import { CommunityService } from './community-service.js';
import { HttpError } from './security.js';
import {
  publishSources,
  VoiceAccessService,
  voiceRoomName,
  type VoiceAdministration,
} from './voice-access-service.js';

const name = z.string().trim().min(1).max(60);
const password = z.string().min(12).max(128);
const username = z
  .string()
  .trim()
  .min(3)
  .max(32)
  .regex(/^[a-zA-Z0-9_]+$/);
const channelSchema = z
  .object({
    name,
    type: z.enum(['voice', 'text']),
    private: z.boolean(),
    memberIds: z.array(z.uuid()).max(100),
    allowSpeak: z.boolean(),
    allowShare: z.boolean(),
    readOnly: z.boolean(),
  })
  .strict();
const publicRoutes = new Set(['/health', '/api/auth/register', '/api/auth/login', '/api/auth/recover']);

export async function createServer(
  configuration: ServerConfiguration,
  presenceSource: PresenceSource = new LiveKitPresenceSource(configuration),
  database?: Database,
  voiceClient?: VoiceAdministration,
): Promise<FastifyInstance> {
  if (!database && !configuration.DATABASE_URL)
    throw new Error('DATABASE_URL is required. Anonymous access is disabled.');
  const db = database ?? new PostgresDatabase(configuration.DATABASE_URL!);
  await migrate(db);
  const accounts = new AccountService(db);
  const communities = new CommunityService(db);
  const tokens = new TokenService(configuration);
  const voice = new VoiceAccessService(db, communities, configuration, voiceClient);
  const server = Fastify({
    bodyLimit: 16_384,
    logger: database
      ? false
      : {
          redact: ['req.headers.authorization', 'req.headers.cookie'],
        },
    trustProxy: (_address, hop) => hop < 1,
  });
  const authenticated = new WeakMap<FastifyRequest, AuthenticatedAccount>();
  const actor = (request: FastifyRequest) => authenticated.get(request)!;
  const id = (request: FastifyRequest, key: string) =>
    z.uuid().parse((request.params as Record<string, string>)[key]);
  await server.register(cors, {
    origin: true,
    methods: ['GET', 'HEAD', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  });
  await server.register(rateLimit, { max: 300, timeWindow: '1 minute' });
  server.addHook('onRequest', async (request, reply) => {
    reply.header('Cache-Control', 'no-store');
    if (request.method === 'OPTIONS' || publicRoutes.has(request.routeOptions.url ?? '')) return;
    authenticated.set(
      request,
      await accounts.authenticate(request.headers.authorization?.replace(/^Bearer /, '')),
    );
  });
  server.setErrorHandler((error, request, reply) => {
    if (error instanceof z.ZodError)
      return reply.code(400).send({ error: 'Invalid request. Check the fields and try again.' });
    if (error instanceof HttpError) return reply.code(error.statusCode).send({ error: error.message });
    const status = (error as { statusCode?: number }).statusCode;
    if (status && status < 500)
      return reply
        .code(status)
        .send({ error: status === 429 ? 'Too many requests. Try again shortly.' : 'Invalid request.' });
    request.log.error({ code: (error as { code?: string }).code }, 'Request failed');
    return reply.code(503).send({ error: 'Service unavailable. Please try again.' });
  });
  const authLimit = { rateLimit: { max: 10, timeWindow: '1 minute' } };
  server.get('/health', async () => {
    await db.query('SELECT 1');
    return { status: 'ok', service: 'pulse-room-token-server' };
  });
  server.post('/api/auth/register', { config: authLimit }, async (request) => {
    const body = z
      .object({ username, displayName: name.max(40), password })
      .strict()
      .parse(request.body);
    return accounts.register(body.username, body.displayName, body.password);
  });
  server.post('/api/auth/login', { config: authLimit }, async (request) => {
    const body = z
      .object({ username, password: z.string().min(1).max(128) })
      .strict()
      .parse(request.body);
    return accounts.login(body.username, body.password);
  });
  server.post('/api/auth/recover', { config: authLimit }, async (request) => {
    const body = z
      .object({ username, recoveryCode: z.string().min(32).max(128), password })
      .strict()
      .parse(request.body);
    return accounts.recover(body.username, body.recoveryCode, body.password);
  });
  server.get('/api/auth/me', async (request) => {
    const { sessionId: _, ...user } = actor(request);
    return { user };
  });
  server.post('/api/auth/logout', async (request) => {
    await accounts.logout(actor(request).sessionId);
    return { ok: true };
  });
  server.post('/api/auth/password', { config: authLimit }, async (request) => {
    const body = z
      .object({ currentPassword: z.string().min(1).max(128), password })
      .strict()
      .parse(request.body);
    await accounts.changePassword(actor(request), body.currentPassword, body.password);
    return { ok: true };
  });
  server.get('/api/servers', async (request) => ({ servers: await communities.list(actor(request).id) }));
  server.post('/api/servers', async (request) =>
    communities.create(actor(request).id, z.object({ name }).strict().parse(request.body).name),
  );
  server.post('/api/invites/join', async (request) =>
    communities.join(
      actor(request).id,
      z
        .object({ code: z.string().trim().min(32).max(128) })
        .strict()
        .parse(request.body).code,
    ),
  );
  server.get('/api/servers/:serverId', async (request) =>
    communities.detail(actor(request).id, id(request, 'serverId')),
  );
  server.patch('/api/servers/:serverId', async (request) => {
    await communities.rename(
      actor(request).id,
      id(request, 'serverId'),
      z.object({ name }).strict().parse(request.body).name,
    );
    return { ok: true };
  });
  server.delete('/api/servers/:serverId', async (request) => {
    await communities.deleteServer(actor(request).id, id(request, 'serverId'));
    return { ok: true };
  });
  server.post('/api/servers/:serverId/transfer', async (request) => {
    await communities.transfer(
      actor(request).id,
      id(request, 'serverId'),
      z.object({ userId: z.uuid() }).strict().parse(request.body).userId,
    );
    return { ok: true };
  });
  server.patch('/api/servers/:serverId/members/:userId', async (request) => {
    await communities.setMember(
      actor(request).id,
      id(request, 'serverId'),
      id(request, 'userId'),
      z
        .object({ role: z.enum(['admin', 'member']) })
        .strict()
        .parse(request.body).role,
    );
    return { ok: true };
  });
  server.delete('/api/servers/:serverId/members/:userId', async (request) => {
    await communities.setMember(actor(request).id, id(request, 'serverId'), id(request, 'userId'), null);
    return { ok: true };
  });
  server.post('/api/servers/:serverId/channels', async (request) => ({
    id: await communities.saveChannel(
      actor(request).id,
      id(request, 'serverId'),
      channelSchema.parse(request.body),
    ),
  }));
  server.patch('/api/channels/:channelId', async (request) => {
    const channelId = id(request, 'channelId');
    const { channel } = await communities.channel(actor(request).id, channelId);
    await communities.saveChannel(
      actor(request).id,
      channel.serverId,
      channelSchema.parse(request.body),
      channelId,
    );
    return { ok: true };
  });
  server.delete('/api/channels/:channelId', async (request) => {
    await communities.deleteChannel(actor(request).id, id(request, 'channelId'));
    return { ok: true };
  });
  server.get('/api/servers/:serverId/invites', async (request) => ({
    invites: await communities.invites(actor(request).id, id(request, 'serverId')),
  }));
  server.post('/api/servers/:serverId/invites', async (request) => {
    const body = z
      .object({ maxUses: z.number().int().min(1).max(100), hours: z.number().int().min(1).max(168) })
      .strict()
      .parse(request.body);
    return communities.invite(actor(request).id, id(request, 'serverId'), body.maxUses, body.hours);
  });
  server.delete('/api/servers/:serverId/invites/:inviteId', async (request) => {
    await communities.revokeInvite(actor(request).id, id(request, 'serverId'), id(request, 'inviteId'));
    return { ok: true };
  });
  server.get('/api/channels/:channelId/messages', async (request) => {
    const { before } = z.object({ before: z.uuid().optional() }).parse(request.query);
    return { messages: await communities.messages(actor(request).id, id(request, 'channelId'), before) };
  });
  server.post(
    '/api/channels/:channelId/messages',
    { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } },
    async (request) => {
      await communities.sendMessage(
        actor(request).id,
        id(request, 'channelId'),
        z
          .object({ content: z.string().trim().min(1).max(2000) })
          .strict()
          .parse(request.body).content,
      );
      return { ok: true };
    },
  );
  server.delete('/api/channels/:channelId/messages/:messageId', async (request) => {
    await communities.deleteMessage(actor(request).id, id(request, 'channelId'), id(request, 'messageId'));
    return { ok: true };
  });
  server.post('/api/rooms/:roomId/token', async (request) => {
    const user = actor(request);
    const { channel, role } = await communities.channel(user.id, id(request, 'roomId'));
    if (channel.type !== 'voice') throw new HttpError(400, 'Choose a voice channel.');
    return tokens.issueRoomToken({
      roomId: voiceRoomName(channel.id),
      identity: `${user.id}:${user.sessionId}`,
      participantName: user.displayName,
      sources: publishSources(channel, role),
    });
  });
  server.get('/api/presence', async (request) => {
    const { serverId } = z.object({ serverId: z.uuid() }).parse(request.query);
    const { channels } = await communities.detail(actor(request).id, serverId);
    try {
      const rooms = await presenceSource.read();
      return {
        rooms: channels
          .filter((c) => c.type === 'voice')
          .map((c) => ({
            roomId: c.id,
            occupants: rooms.find((room) => room.roomId === voiceRoomName(c.id))?.occupants ?? [],
          })),
      };
    } catch {
      throw new HttpError(502, 'Voice presence is temporarily unavailable.');
    }
  });
  let timer: ReturnType<typeof setInterval> | undefined;
  server.addHook('onListen', async () => {
    const check = () =>
      void voice.reconcile().catch(() => server.log.warn('Voice access reconciliation failed; retrying'));
    check();
    timer = setInterval(check, 10_000);
    timer.unref();
  });
  server.addHook('onClose', async () => {
    if (timer) clearInterval(timer);
    await db.close();
  });
  return server;
}
