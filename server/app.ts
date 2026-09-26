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
import { ImageService, imageLimits } from './image-service.js';
import { HttpError } from './security.js';
import { tagBadges, tagModes, tagTextPattern } from '../src/shared/community.js';
import { allPermissions, channelScoped, has, Permission } from '../src/shared/permissions.js';
import { RoleService } from './role-service.js';
import { TagService, type TagInput } from './tag-service.js';
import {
  publishSources,
  VoiceAccessService,
  voiceRoomName,
  type VoiceAdministration,
} from './voice-access-service.js';

const name = z.string().trim().min(1).max(60);
const colour = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/)
  .transform((value) => value.toLowerCase());
const theme = z.object({ primary: colour, accent: colour }).strict();
const tagInput = z
  .object({
    text: z.string().regex(tagTextPattern),
    badge: z.enum(tagBadges),
    colour,
    name: z.string().trim().max(32),
    mode: z.enum(tagModes as [TagInput['mode'], ...TagInput['mode'][]]),
    roleIds: z.array(z.uuid()).max(50),
  })
  .strict();
const bits = (mask: number) =>
  z
    .number()
    .int()
    .min(0)
    .refine((value) => (value & ~mask) === 0);
const override = z
  .object({
    targetType: z.enum(['role', 'member']),
    targetId: z.uuid(),
    allow: bits(channelScoped),
    deny: bits(channelScoped),
  })
  .strict();
const overrides = z.object({ overrides: z.array(override).max(100) }).strict();
const roleInput = z
  .object({
    name: z.string().trim().min(1).max(32),
    colour: colour.nullable(),
    permissions: bits(allPermissions),
    hoist: z.boolean(),
  })
  .strict();
const password = z.string().min(12).max(128);
const username = z
  .string()
  .trim()
  .min(3)
  .max(32)
  .regex(/^[a-zA-Z0-9_]+$/);
// Older clients describe a channel by the switches of the fixed roles; this
// version by where it lives. Both are accepted, and the old form is turned
// into overrides on the way in.
const channelSchema = z.union([
  z
    .object({
      name,
      type: z.enum(['voice', 'text']),
      private: z.boolean(),
      memberIds: z.array(z.uuid()).max(100),
      allowSpeak: z.boolean(),
      allowShare: z.boolean(),
      readOnly: z.boolean(),
    })
    .strict(),
  z.object({ name, type: z.enum(['voice', 'text']), categoryId: z.uuid().nullable().optional() }).strict(),
]);
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
  const images = new ImageService(db);
  const tokens = new TokenService(configuration);
  const voice = new VoiceAccessService(db, communities, configuration, voiceClient);
  const roles = new RoleService(db);
  const tags = new TagService(db);
  const server = Fastify({
    bodyLimit: 16_384,
    logger: database
      ? false
      : {
          redact: ['req.headers.authorization', 'req.headers.cookie'],
        },
    trustProxy: (_address, hop) => hop < 1,
  });
  // Pictures arrive as raw bytes. No multipart parser, no file names, no
  // temporary files: fewer moving parts is the whole security argument.
  server.addContentTypeParser(
    ['image/png', 'image/webp', 'image/gif'],
    { parseAs: 'buffer', bodyLimit: imageLimits.bytes },
    (_request, body, done) => done(null, body),
  );
  const authenticated = new WeakMap<FastifyRequest, AuthenticatedAccount>();
  const actor = (request: FastifyRequest) => authenticated.get(request)!;
  const id = (request: FastifyRequest, key: string) =>
    z.uuid().parse((request.params as Record<string, string>)[key]);
  await server.register(cors, {
    origin: true,
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
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
  /** Pushes a change of who may speak or hear into the calls now, not at the next sweep. */
  const enforce = () => void voice.reconcile().catch(() => server.log.warn('Voice access reconciliation failed'));
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
  server.get('/api/auth/me', async (request) => ({ user: await accounts.profile(actor(request).id) }));
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
  server.patch('/api/account/theme', async (request) => {
    const body = z.object({ theme: theme.nullable() }).strict().parse(request.body);
    await accounts.setTheme(actor(request).id, body.theme);
    return { theme: body.theme };
  });

  // One tag is worn per server now, and roles replace the fixed standings; the
  // calls of older clients for those answer with why they no longer work.
  const updateRequired = async () => {
    throw new HttpError(410, 'Update Pulse Room to use roles and server tags.');
  };
  server.patch('/api/account/tag', updateRequired);
  server.patch('/api/servers/:serverId/tag', updateRequired);
  server.patch('/api/servers/:serverId/members/:userId', updateRequired);

  server.get('/api/account/tags', async (request) => ({ choices: await tags.choices(actor(request).id) }));
  server.put('/api/servers/:serverId/worn-tag', async (request) => {
    const { tagId } = z.object({ tagId: z.uuid().nullable() }).strict().parse(request.body);
    await tags.wear(actor(request).id, id(request, 'serverId'), tagId);
    return { ok: true };
  });

  server.patch('/api/account/profile', async (request) => {
    const { bio } = z.object({ bio: z.string().trim().max(200) }).strict().parse(request.body);
    await accounts.setBio(actor(request).id, bio);
    return { bio };
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
  server.delete('/api/servers/:serverId/members/:userId', async (request) => {
    await communities.removeFromServer(actor(request).id, id(request, 'serverId'), id(request, 'userId'));
    enforce();
    return { ok: true };
  });

  // ------------------------------------------------------------ roles
  server.post('/api/servers/:serverId/roles', async (request) => ({
    id: await roles.create(actor(request).id, id(request, 'serverId'), roleInput.parse(request.body)),
  }));
  server.patch('/api/servers/:serverId/roles/:roleId', async (request) => {
    await roles.update(
      actor(request).id,
      id(request, 'serverId'),
      id(request, 'roleId'),
      roleInput.parse(request.body),
    );
    enforce();
    return { ok: true };
  });
  server.delete('/api/servers/:serverId/roles/:roleId', async (request) => {
    await roles.remove(actor(request).id, id(request, 'serverId'), id(request, 'roleId'));
    enforce();
    return { ok: true };
  });
  server.put('/api/servers/:serverId/roles', async (request) => {
    const { roleIds } = z.object({ roleIds: z.array(z.uuid()).max(50) }).strict().parse(request.body);
    await roles.reorder(actor(request).id, id(request, 'serverId'), roleIds);
    return { ok: true };
  });
  server.put('/api/servers/:serverId/members/:userId/roles', async (request) => {
    const { roleIds } = z.object({ roleIds: z.array(z.uuid()).max(50) }).strict().parse(request.body);
    await roles.setMemberRoles(actor(request).id, id(request, 'serverId'), id(request, 'userId'), roleIds);
    enforce();
    return { ok: true };
  });

  // ------------------------------------------------------- moderation
  server.patch('/api/servers/:serverId/members/:userId/moderation', async (request) => {
    const body = z
      .object({
        timeoutMinutes: z.number().int().min(1).max(40_320).nullable().optional(),
        muted: z.boolean().optional(),
        deafened: z.boolean().optional(),
      })
      .strict()
      .parse(request.body);
    await roles.moderate(actor(request).id, id(request, 'serverId'), id(request, 'userId'), body);
    enforce();
    return { ok: true };
  });
  server.post('/api/servers/:serverId/members/:userId/disconnect', async (request) => {
    const userId = id(request, 'userId');
    await roles.checkDisconnect(actor(request).id, id(request, 'serverId'), userId);
    await voice.disconnect(userId);
    return { ok: true };
  });
  server.get('/api/servers/:serverId/bans', async (request) => ({
    bans: await roles.bans(actor(request).id, id(request, 'serverId')),
  }));
  server.post('/api/servers/:serverId/bans', async (request) => {
    const body = z
      .object({ userId: z.uuid(), reason: z.string().trim().max(200).default('') })
      .strict()
      .parse(request.body);
    await roles.ban(actor(request).id, id(request, 'serverId'), body.userId, body.reason);
    enforce();
    return { ok: true };
  });
  server.delete('/api/servers/:serverId/bans/:userId', async (request) => {
    await roles.unban(actor(request).id, id(request, 'serverId'), id(request, 'userId'));
    return { ok: true };
  });

  // ------------------------------------------------------------- tags
  server.post('/api/servers/:serverId/tags', async (request) => ({
    id: await tags.create(actor(request).id, id(request, 'serverId'), tagInput.parse(request.body)),
  }));
  server.patch('/api/tags/:tagId', async (request) => {
    await tags.update(actor(request).id, id(request, 'tagId'), tagInput.parse(request.body));
    return { ok: true };
  });
  server.delete('/api/tags/:tagId', async (request) => {
    await tags.remove(actor(request).id, id(request, 'tagId'));
    return { ok: true };
  });
  server.put('/api/tags/:tagId/holders/:userId', async (request) => {
    await tags.assign(actor(request).id, id(request, 'tagId'), id(request, 'userId'), true);
    return { ok: true };
  });
  server.delete('/api/tags/:tagId/holders/:userId', async (request) => {
    await tags.assign(actor(request).id, id(request, 'tagId'), id(request, 'userId'), false);
    return { ok: true };
  });

  // ------------------------------------------------ channels, categories
  server.post('/api/servers/:serverId/channels', async (request) => ({
    id: await communities.createChannel(
      actor(request).id,
      id(request, 'serverId'),
      channelSchema.parse(request.body),
    ),
  }));
  server.patch('/api/channels/:channelId', async (request) => {
    await communities.updateChannel(actor(request).id, id(request, 'channelId'), channelSchema.parse(request.body));
    enforce();
    return { ok: true };
  });
  server.put('/api/channels/:channelId/overrides', async (request) => {
    await communities.setChannelOverrides(
      actor(request).id,
      id(request, 'channelId'),
      overrides.parse(request.body).overrides,
    );
    enforce();
    return { ok: true };
  });
  server.post('/api/channels/:channelId/sync', async (request) => {
    await communities.syncChannel(actor(request).id, id(request, 'channelId'));
    enforce();
    return { ok: true };
  });
  server.post('/api/servers/:serverId/categories', async (request) => ({
    id: await communities.createCategory(
      actor(request).id,
      id(request, 'serverId'),
      z.object({ name }).strict().parse(request.body).name,
    ),
  }));
  server.patch('/api/categories/:categoryId', async (request) => {
    await communities.renameCategory(
      actor(request).id,
      id(request, 'categoryId'),
      z.object({ name }).strict().parse(request.body).name,
    );
    return { ok: true };
  });
  server.put('/api/categories/:categoryId/overrides', async (request) => {
    await communities.setCategoryOverrides(
      actor(request).id,
      id(request, 'categoryId'),
      overrides.parse(request.body).overrides,
    );
    enforce();
    return { ok: true };
  });
  server.delete('/api/categories/:categoryId', async (request) => {
    await communities.deleteCategory(actor(request).id, id(request, 'categoryId'));
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
    const { channel, permissions, access } = await communities.channel(user.id, id(request, 'roomId'));
    if (channel.type !== 'voice') throw new HttpError(400, 'Choose a voice channel.');
    if (!has(permissions, Permission.Connect)) throw new HttpError(403, 'You cannot join this call.');
    return tokens.issueRoomToken({
      roomId: voiceRoomName(channel.id),
      identity: `${user.id}:${user.sessionId}`,
      participantName: user.displayName,
      sources: publishSources(permissions),
      canSubscribe: !access.deafened,
    });
  });
  const uploadLimit = {
    bodyLimit: imageLimits.bytes,
    config: { rateLimit: { max: 12, timeWindow: '10 minutes' } },
  };
  const uploaded = (request: FastifyRequest): Buffer => {
    if (!Buffer.isBuffer(request.body)) throw new HttpError(415, 'Send a PNG, WebP or GIF image.');
    return request.body;
  };

  server.post('/api/account/avatar', uploadLimit, async (request) => {
    const imageId = await images.store(uploaded(request), 'avatar');
    await accounts.setAvatar(actor(request).id, imageId, images);
    return { avatarId: imageId };
  });

  server.delete('/api/account/avatar', async (request) => {
    await accounts.setAvatar(actor(request).id, null, images);
    return { avatarId: null };
  });

  server.post('/api/account/banner', uploadLimit, async (request) => {
    const imageId = await images.store(uploaded(request), 'banner');
    await accounts.setBanner(actor(request).id, imageId, images);
    return { bannerId: imageId };
  });

  server.delete('/api/account/banner', async (request) => {
    await accounts.setBanner(actor(request).id, null, images);
    return { bannerId: null };
  });

  server.post('/api/servers/:serverId/icon', uploadLimit, async (request) => {
    const serverId = id(request, 'serverId');
    // Stored first, then attached: attaching is the step that checks the role,
    // and a picture that never attaches is collected rather than left behind.
    const imageId = await images.store(uploaded(request), 'icon');
    try {
      await communities.setIcon(actor(request).id, serverId, imageId, images);
    } catch (error) {
      await images.collect(imageId);
      throw error;
    }
    return { iconId: imageId };
  });

  server.delete('/api/servers/:serverId/icon', async (request) => {
    await communities.setIcon(actor(request).id, id(request, 'serverId'), null, images);
    return { iconId: null };
  });

  server.get('/api/images/:imageId', async (request, reply) => {
    const imageId = z
      .string()
      .regex(/^[0-9a-f]{64}$/)
      .parse((request.params as Record<string, string>).imageId);
    const image = await images.read(actor(request).id, imageId);
    return reply
      .header('Content-Type', image.mime)
      .header('Content-Disposition', 'inline')
      .header('X-Content-Type-Options', 'nosniff')
      .header('Content-Security-Policy', "default-src 'none'; sandbox")
      .header('Cross-Origin-Resource-Policy', 'same-origin')
      // The address is the hash of the content, so it can never mean anything else.
      .header('Cache-Control', 'private, max-age=31536000, immutable')
      .send(image.bytes);
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
