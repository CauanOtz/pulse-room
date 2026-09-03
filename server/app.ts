import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import Fastify, { type FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { ServerConfiguration } from './config.js';
import { LiveKitPresenceSource, type PresenceSource } from './presence-service.js';
import { TokenService } from './token-service.js';

const tokenBodySchema = z.object({
  participantName: z.string().trim().min(1).max(40),
});

const roomParametersSchema = z.object({
  roomId: z.string().trim().min(1).max(64).regex(/^[a-zA-Z0-9_-]+$/),
});

export async function createServer(
  configuration: ServerConfiguration,
  presenceSource: PresenceSource = new LiveKitPresenceSource(configuration),
): Promise<FastifyInstance> {
  const server = Fastify({ logger: true });
  const tokenService = new TokenService(configuration);

  await server.register(cors, {
    origin: true,
  });
  await server.register(rateLimit, { max: 30, timeWindow: '1 minute' });

  server.get('/health', async () => ({ status: 'ok', service: 'pulse-room-token-server' }));

  const isAuthorized = (authorization?: string) =>
    authorization === `Bearer ${configuration.APP_INVITE_SECRET}`;

  // A member of the room may see who is sitting in the other voice channels,
  // which no client can discover on its own.
  server.get('/api/presence', async (request, reply) => {
    if (!isAuthorized(request.headers.authorization)) {
      return reply.code(401).send({ error: 'unauthorized' });
    }

    try {
      return { rooms: await presenceSource.read() };
    } catch (error) {
      request.log.error(error, 'presence lookup failed');
      return reply.code(502).send({ error: 'presence_unavailable' });
    }
  });

  server.post('/api/rooms/:roomId/token', async (request, reply) => {
    if (!isAuthorized(request.headers.authorization)) {
      return reply.code(401).send({ error: 'unauthorized' });
    }

    const parameters = roomParametersSchema.safeParse(request.params);
    const body = tokenBodySchema.safeParse(request.body);
    if (!parameters.success || !body.success) {
      return reply.code(400).send({ error: 'invalid_request' });
    }

    return tokenService.issueRoomToken({
      roomId: parameters.data.roomId,
      participantName: body.data.participantName,
    });
  });

  return server;
}
