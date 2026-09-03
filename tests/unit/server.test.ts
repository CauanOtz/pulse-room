// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest';
import { createServer } from '../../server/app';
import { LiveKitPresenceSource } from '../../server/presence-service';
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

  it('prefers the self-hosted LiveKit deployment when it is configured', async () => {
    const selfHostedUrl = 'wss://livekit.example.com';
    const server = await createServer({
      ...configuration,
      SELF_HOSTED_LIVEKIT_URL: selfHostedUrl,
      SELF_HOSTED_LIVEKIT_API_KEY: 'self-hosted-key',
      SELF_HOSTED_LIVEKIT_API_SECRET: 'self-hosted-secret',
    });
    servers.push(server);

    const response = await server.inject({
      method: 'POST',
      url: '/api/rooms/lounge/token',
      headers: { authorization: 'Bearer test-secret' },
      payload: { participantName: 'Alex' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(expect.objectContaining({ serverUrl: selfHostedUrl }));
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

describe('LiveKitPresenceSource', () => {
  it('keeps the other rooms when one disappears between the two calls', async () => {
    const source = new LiveKitPresenceSource(
      configuration,
      {
        listRooms: async () => [{ name: 'lounge' }, { name: 'game-room' }],
        listParticipants: async (room: string) => {
          if (room === 'lounge') throw new Error('requested room does not exist');
          return [{ identity: 'babi-1', name: 'babi' }];
        },
      },
      0,
    );

    expect(await source.read()).toEqual([
      { roomId: 'lounge', occupants: [] },
      { roomId: 'game-room', occupants: [{ identity: 'babi-1', name: 'babi' }] },
    ]);
  });

  it('answers repeated questions from the cache', async () => {
    let listings = 0;
    const source = new LiveKitPresenceSource(
      configuration,
      {
        listRooms: async () => {
          listings += 1;
          return [{ name: 'lounge' }];
        },
        listParticipants: async () => [{ identity: 'you-1', name: 'You' }],
      },
      60_000,
    );

    await source.read();
    await source.read();

    expect(listings).toBe(1);
  });
});
