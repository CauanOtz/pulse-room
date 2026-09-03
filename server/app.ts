import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import Fastify, { type FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { ServerConfiguration } from './config.js';
import { TokenService } from './token-service.js';

const tokenBodySchema = z.object({
  participantName: z.string().trim().min(1).max(40),
});

const roomParametersSchema = z.object({
  roomId: z.string().trim().min(1).max(64).regex(/^[a-zA-Z0-9_-]+$/),
});

export async function createServer(configuration: ServerConfiguration): Promise<FastifyInstance> {
  const server = Fastify({ logger: true });
  const tokenService = new TokenService(configuration);

  await server.register(cors, {
    origin: true,
  });
  await server.register(rateLimit, { max: 30, timeWindow: '1 minute' });

  server.get('/health', async () => ({ status: 'ok', service: 'pulse-room-token-server' }));

  server.post('/api/rooms/:roomId/token', async (request, reply) => {
    const authorization = request.headers.authorization;
    if (authorization !== `Bearer ${configuration.APP_INVITE_SECRET}`) {
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
