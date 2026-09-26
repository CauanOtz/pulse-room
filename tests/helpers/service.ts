import { expect, vi } from 'vitest';
import { createServer } from '../../server/app';
import type { ServerConfiguration } from '../../server/config';
import type { VoiceAdministration } from '../../server/voice-access-service';
import type { AccountSession, CommunityDetail } from '../../src/shared/community';
import { TestDatabase } from './database';

export const serviceConfig: ServerConfiguration = {
  PORT: 3001,
  HOST: '127.0.0.1',
  APP_INVITE_SECRET: 'legacy-access-code',
  LIVEKIT_URL: 'wss://example.livekit.cloud',
  LIVEKIT_API_KEY: 'cloud-key',
  LIVEKIT_API_SECRET: 'cloud-secret',
  SELF_HOSTED_LIVEKIT_URL: 'wss://self-hosted.example.com',
  SELF_HOSTED_LIVEKIT_API_KEY: 'self-key',
  SELF_HOSTED_LIVEKIT_API_SECRET: 'self-secret',
};

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

/**
 * A whole service on a database of its own, with the voice server replaced by
 * a record of what it was told. Each test file gets one, so what one file does
 * to its servers never leaks into another's.
 */
export async function startService() {
  const db = new TestDatabase();
  const rooms: { name: string; participants: { identity: string }[] }[] = [];
  const voice = {
    rooms,
    listRooms: vi.fn(async () => voice.rooms.map(({ name }) => ({ name }))),
    listParticipants: vi.fn(
      async (room: string): Promise<{ identity: string }[]> =>
        voice.rooms.find((entry) => entry.name === room)?.participants ?? [],
    ),
    removeParticipant: vi.fn(async (_room: string, _identity: string) => {}),
    updateParticipant: vi.fn(async (..._args: Parameters<VoiceAdministration['updateParticipant']>) => {}),
  };
  const app = await createServer(serviceConfig, { read: async () => [] }, db, voice);
  let address = 1;
  const request = (method: Method, url: string, session?: AccountSession, payload?: unknown) =>
    app.inject({
      method,
      url,
      payload: payload as never,
      headers: {
        ...(session ? { authorization: `Bearer ${session.token}` } : {}),
        'x-forwarded-for': `10.20.${Math.floor(address / 200)}.${(++address % 200) + 1}`,
      },
    });
  const createAccount = async (username: string) => {
    const result = await request('POST', '/api/auth/register', undefined, {
      username,
      displayName: username,
      password: 'A long test passphrase!',
    });
    expect(result.statusCode).toBe(200);
    return result.json() as AccountSession;
  };
  const detail = async (session: AccountSession, serverId: string) =>
    (await request('GET', `/api/servers/${serverId}`, session)).json() as CommunityDetail;
  /** A server owned by the first account, with every other account let in. */
  const serverWith = async (name: string, owner: AccountSession, ...members: AccountSession[]) => {
    const { id } = (await request('POST', '/api/servers', owner, { name })).json() as { id: string };
    for (const member of members) {
      const { code } = (await request('POST', `/api/servers/${id}/invites`, owner, { maxUses: 1, hours: 1 })).json();
      expect((await request('POST', '/api/invites/join', member, { code })).statusCode).toBe(200);
    }
    return id;
  };
  return { app, db, voice, request, createAccount, detail, serverWith };
}
