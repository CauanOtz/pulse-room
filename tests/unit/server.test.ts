// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest';
import { createServer } from '../../server/app';
import type { ServerConfiguration } from '../../server/config';

const configuration: ServerConfiguration = {
  PORT: 3001,
  HOST: '127.0.0.1',
  APP_INVITE_SECRET: 'test-secret',
  LIVEKIT_URL: 'wss://example.livekit.cloud',
  LIVEKIT_API_KEY: 'api-key',
  LIVEKIT_API_SECRET: 'api-secret',
};

describe('token server', () => {
  const servers: Awaited<ReturnType<typeof createServer>>[] = [];
  afterEach(async () => Promise.all(servers.map((server) => server.close())));

  it('reports health', async () => {
    const server = await createServer(configuration);
    servers.push(server);
    const response = await server.inject({ method: 'GET', url: '/health' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'ok', service: 'pulse-room-token-server' });
  });

  it('rejects an invalid room access code', async () => {
    const server = await createServer(configuration);
    servers.push(server);
    const response = await server.inject({
      method: 'POST',
      url: '/api/rooms/lounge/token',
      headers: { authorization: 'Bearer wrong-code' },
      payload: { participantName: 'Alex' },
    });
    expect(response.statusCode).toBe(401);
  });

  it('issues a LiveKit room token to an authorized friend', async () => {
    const server = await createServer(configuration);
    servers.push(server);
    const response = await server.inject({
      method: 'POST',
      url: '/api/rooms/lounge/token',
      headers: { authorization: 'Bearer test-secret' },
      payload: { participantName: 'Alex' },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(expect.objectContaining({
      serverUrl: configuration.LIVEKIT_URL,
      token: expect.any(String),
    }));
  });
});

describe('presence', () => {
  const servers: Awaited<ReturnType<typeof createServer>>[] = [];
  afterEach(async () => Promise.all(servers.map((server) => server.close())));

  it('keeps the roster of every room behind the access code', async () => {
    const server = await createServer(configuration, { read: async () => [] });
    servers.push(server);

    const response = await server.inject({ method: 'GET', url: '/api/presence' });

    expect(response.statusCode).toBe(401);
  });

  it('reports who is sitting in each room', async () => {
    const server = await createServer(configuration, {
      read: async () => [
        { roomId: 'game-room', occupants: [{ identity: 'babi-1', name: 'babi' }] },
      ],
    });
    servers.push(server);

    const response = await server.inject({
      method: 'GET',
      url: '/api/presence',
      headers: { authorization: 'Bearer test-secret' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      rooms: [{ roomId: 'game-room', occupants: [{ identity: 'babi-1', name: 'babi' }] }],
    });
  });

  it('answers plainly when LiveKit cannot be reached', async () => {
    const server = await createServer(configuration, {
      read: async () => {
        throw new Error('livekit is down');
      },
    });
    servers.push(server);

    const response = await server.inject({
      method: 'GET',
      url: '/api/presence',
      headers: { authorization: 'Bearer test-secret' },
    });

    expect(response.statusCode).toBe(502);
  });
});
