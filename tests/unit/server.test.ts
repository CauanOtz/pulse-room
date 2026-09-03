// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { createServer } from '../../server/app';
import { LiveKitPresenceSource, type RoomOccupancy } from '../../server/presence-service';
import { loadConfiguration, type ServerConfiguration } from '../../server/config';
import { TestDatabase } from '../helpers/database';
import { CommunityService } from '../../server/community-service';
import { VoiceAccessService, voiceRoomName } from '../../server/voice-access-service';
import { AccountService } from '../../server/account-service';
import type { AccountSession, Community, CommunityDetail } from '../../src/shared/community';

const config: ServerConfiguration = {
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
const db = new TestDatabase();
let app: Awaited<ReturnType<typeof createServer>>;
let owner: AccountSession, wife: AccountSession, friend: AccountSession, stranger: AccountSession;
let couple: Community, friends: Community;
let coupleDetail: CommunityDetail, friendsDetail: CommunityDetail;
let rooms: RoomOccupancy[] = [];
let presenceDown = false;
let requestId = 1;
const password = 'A long test passphrase!';
const request = (
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  url: string,
  session?: AccountSession,
  payload?: unknown,
) =>
  app.inject({
    method,
    url,
    payload: payload as never,
    headers: {
      ...(session ? { authorization: `Bearer ${session.token}` } : {}),
      'x-forwarded-for': `10.0.${Math.floor(requestId / 200)}.${(++requestId % 200) + 1}`,
    },
  });
const createAccount = async (username: string) => {
  const result = await request('POST', '/api/auth/register', undefined, {
    username,
    displayName: username,
    password,
  });
  expect(result.statusCode).toBe(200);
  return result.json() as AccountSession;
};
beforeAll(async () => {
  app = await createServer(
    config,
    {
      read: async () => {
        if (presenceDown) throw new Error('down');
        return rooms;
      },
    },
    db,
  );
  owner = await createAccount('Owner');
  wife = await createAccount('Wife');
  friend = await createAccount('Friend');
  stranger = await createAccount('Stranger');
  couple = (await request('POST', '/api/servers', owner, { name: 'Just us' })).json();
  friends = (await request('POST', '/api/servers', owner, { name: 'Friends' })).json();
  for (const [community, member] of [
    [couple, wife],
    [friends, friend],
  ] as const) {
    const { code } = (
      await request('POST', `/api/servers/${community.id}/invites`, owner, { maxUses: 1, hours: 24 })
    ).json();
    expect((await request('POST', '/api/invites/join', member, { code })).statusCode).toBe(200);
  }
  coupleDetail = (await request('GET', `/api/servers/${couple.id}`, owner)).json();
  friendsDetail = (await request('GET', `/api/servers/${friends.id}`, owner)).json();
}, 30_000);
afterAll(async () => {
  await app?.close();
});

describe('authentication', () => {
  it('checks database health and fails closed without persistence', async () => {
    expect((await request('GET', '/health')).statusCode).toBe(200);
    await expect(createServer(config)).rejects.toThrow('DATABASE_URL');
  });
  it('rejects anonymous and old shared-code API access', async () => {
    expect((await request('GET', '/api/servers')).statusCode).toBe(401);
    expect(
      (
        await request(
          'POST',
          '/api/rooms/lounge/token',
          { token: config.APP_INVITE_SECRET! } as AccountSession,
          {},
        )
      ).statusCode,
    ).toBe(401);
    expect((await request('GET', '/api/presence')).statusCode).toBe(401);
  });
  it('stores salted password hashes and only hashes of session/recovery secrets', async () => {
    const {
      rows: [account],
    } = await db.query<{ password_hash: string; recovery_hash: string }>(
      'SELECT password_hash,recovery_hash FROM accounts WHERE id=$1',
      [owner.user.id],
    );
    expect(account.password_hash).toMatch(/^scrypt-v1\$/);
    expect(account.password_hash).not.toContain(password);
    expect(account.recovery_hash).not.toBe(owner.recoveryCode);
    expect((await db.query('SELECT id FROM sessions WHERE token_hash=$1', [owner.token])).rows).toHaveLength(
      0,
    );
  });
  it('normalizes usernames, never exposes password hashes, and rejects duplicates', async () => {
    expect(
      (await request('POST', '/api/auth/login', undefined, { username: 'OWNER', password })).json().user,
    ).toEqual(owner.user);
    expect((await request('GET', '/api/auth/me', owner)).json()).toEqual({ user: owner.user });
    expect(
      (
        await request('POST', '/api/auth/register', undefined, {
          username: 'OWNER',
          displayName: 'x',
          password,
        })
      ).statusCode,
    ).toBe(409);
    expect(
      (
        await request('POST', '/api/auth/register', undefined, {
          username: 'weak',
          displayName: 'x',
          password: 'short',
        })
      ).statusCode,
    ).toBe(400);
  });
  it('uses the same login error for unknown account and wrong password', async () => {
    const a = await request('POST', '/api/auth/login', undefined, { username: 'missing', password });
    const b = await request('POST', '/api/auth/login', undefined, {
      username: 'owner',
      password: 'incorrect',
    });
    expect(a.statusCode).toBe(401);
    expect(a.json()).toEqual(b.json());
  });
  it('expires and revokes sessions on logout', async () => {
    const session = (
      await request('POST', '/api/auth/login', undefined, { username: 'stranger', password })
    ).json() as AccountSession;
    expect((await request('POST', '/api/auth/logout', session)).statusCode).toBe(200);
    expect((await request('GET', '/api/auth/me', session)).statusCode).toBe(401);
    await db.query("UPDATE sessions SET expires_at=now()-interval '1 hour' WHERE account_id=$1", [
      stranger.user.id,
    ]);
    expect((await request('GET', '/api/servers', stranger)).statusCode).toBe(401);
  });
  it('rotates one-time recovery codes and invalidates all previous sessions', async () => {
    const account = await createAccount('Recoverable');
    const reset = await request('POST', '/api/auth/recover', undefined, {
      username: 'recoverable',
      recoveryCode: account.recoveryCode,
      password: 'A different long password',
    });
    expect(reset.statusCode).toBe(200);
    expect(reset.json().recoveryCode).not.toBe(account.recoveryCode);
    expect((await request('GET', '/api/auth/me', account)).statusCode).toBe(401);
    expect(
      (
        await request('POST', '/api/auth/recover', undefined, {
          username: 'recoverable',
          recoveryCode: account.recoveryCode,
          password,
        })
      ).statusCode,
    ).toBe(401);
  });
  it('rate limits repeated authentication attempts', async () => {
    for (let i = 0; i < 11; i++) {
      const result = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: {},
        headers: { 'x-forwarded-for': '10.99.1.2' },
      });
      expect(result.statusCode).toBe(i === 10 ? 429 : 400);
    }
  });
});

describe('server and channel isolation', () => {
  it('shows each account only the servers it belongs to', async () => {
    expect((await request('GET', '/api/servers', wife)).json().servers.map((s: Community) => s.name)).toEqual(
      ['Just us'],
    );
    expect(
      (await request('GET', '/api/servers', friend)).json().servers.map((s: Community) => s.name),
    ).toEqual(['Friends']);
    expect((await request('GET', '/api/servers', owner)).json().servers).toHaveLength(2);
  });
  it('blocks guessed server IDs, channel IDs, presence, messages and call tokens', async () => {
    const text = coupleDetail.channels.find((c) => c.type === 'text')!;
    const voice = coupleDetail.channels.find((c) => c.type === 'voice')!;
    for (const url of [
      `/api/servers/${couple.id}`,
      `/api/channels/${text.id}/messages`,
      `/api/presence?serverId=${couple.id}`,
    ])
      expect((await request('GET', url, friend)).statusCode).toBe(404);
    expect((await request('POST', `/api/rooms/${voice.id}/token`, friend, {})).statusCode).toBe(404);
    expect(
      (await request('POST', `/api/channels/${text.id}/messages`, friend, { content: 'intrusion' }))
        .statusCode,
    ).toBe(404);
  });
  it('namespaces voice rooms and takes identity from the session, not a supplied name', async () => {
    const channel = coupleDetail.channels.find((c) => c.type === 'voice')!;
    const result = await request('POST', `/api/rooms/${channel.id}/token`, wife, {
      participantName: 'Owner',
    });
    expect(result.statusCode).toBe(200);
    expect(result.json().serverUrl).toBe(config.SELF_HOSTED_LIVEKIT_URL);
    const jwt = JSON.parse(Buffer.from(result.json().token.split('.')[1], 'base64url').toString());
    expect(jwt.name).toBe('Wife');
    expect(jwt.sub).toMatch(new RegExp(`^${wife.user.id}:`));
    expect(jwt.video.room).toBe(voiceRoomName(channel.id));
    expect(jwt.exp - jwt.nbf).toBeLessThanOrEqual(60);
    expect(jwt.video.canPublishData).toBe(false);
  });
  it('filters presence to accessible channels in the requested server', async () => {
    rooms = [
      {
        roomId: voiceRoomName(coupleDetail.channels.find((c) => c.type === 'voice')!.id),
        occupants: [{ identity: 'wife', name: 'Wife' }],
      },
      {
        roomId: voiceRoomName(friendsDetail.channels.find((c) => c.type === 'voice')!.id),
        occupants: [{ identity: 'friend', name: 'Friend' }],
      },
    ];
    const response = await request('GET', `/api/presence?serverId=${couple.id}`, wife);
    expect(response.json().rooms).toHaveLength(1);
    expect(response.body).not.toContain('Friend');
    presenceDown = true;
    expect((await request('GET', `/api/presence?serverId=${couple.id}`, wife)).statusCode).toBe(502);
    presenceDown = false;
  });
  it('enforces role hierarchy, protects ownership and blocks self promotion', async () => {
    expect(
      (await request('PATCH', `/api/servers/${couple.id}/members/${wife.user.id}`, wife, { role: 'admin' }))
        .statusCode,
    ).toBe(403);
    expect((await request('DELETE', `/api/servers/${couple.id}`, wife)).statusCode).toBe(403);
    expect(
      (await request('DELETE', `/api/servers/${couple.id}/members/${owner.user.id}`, owner)).statusCode,
    ).toBe(403);
    expect(
      (await request('POST', `/api/servers/${couple.id}/invites`, wife, { maxUses: 1, hours: 24 }))
        .statusCode,
    ).toBe(403);
  });
  it('hides private channels and enforces speak/share grants and read-only chat', async () => {
    const service = new CommunityService(db);
    const input = {
      name: 'Private',
      type: 'voice' as const,
      private: true,
      memberIds: [],
      allowSpeak: false,
      allowShare: false,
      readOnly: false,
    };
    const channelId = await service.saveChannel(owner.user.id, couple.id, input);
    expect(
      (await request('GET', `/api/servers/${couple.id}`, wife))
        .json()
        .channels.some((c: { id: string }) => c.id === channelId),
    ).toBe(false);
    expect((await request('POST', `/api/rooms/${channelId}/token`, wife, {})).statusCode).toBe(404);
    await service.saveChannel(owner.user.id, couple.id, { ...input, memberIds: [wife.user.id] }, channelId);
    const result = await request('POST', `/api/rooms/${channelId}/token`, wife, {});
    const jwt = JSON.parse(Buffer.from(result.json().token.split('.')[1], 'base64url').toString());
    expect(jwt.video.canPublish).toBe(false);
    expect(jwt.video.canSubscribe).toBe(true);
    const textId = await service.saveChannel(owner.user.id, couple.id, {
      ...input,
      type: 'text',
      private: false,
      readOnly: true,
    });
    expect(
      (await request('POST', `/api/channels/${textId}/messages`, wife, { content: 'forbidden' })).statusCode,
    ).toBe(403);
    expect(
      (await request('POST', `/api/channels/${textId}/messages`, owner, { content: 'announcement' }))
        .statusCode,
    ).toBe(200);
    expect((await request('POST', `/api/rooms/${textId}/token`, owner, {})).statusCode).toBe(400);
  });
  it('persists chat, paginates it, and restricts deletion to author or manager', async () => {
    const id = coupleDetail.channels.find((c) => c.type === 'text')!.id;
    expect(
      (
        await request('POST', `/api/channels/${id}/messages`, wife, {
          content: '<script>alert(1)</script> hello',
        })
      ).statusCode,
    ).toBe(200);
    const messages = (await request('GET', `/api/channels/${id}/messages`, owner)).json().messages;
    expect(messages[0].content).toContain('<script>');
    expect(messages[0].authorId).toBe(wife.user.id);
    const own = await request('POST', `/api/channels/${id}/messages`, owner, { content: 'second' });
    expect(own.statusCode).toBe(200);
    const latest = (await request('GET', `/api/channels/${id}/messages`, owner)).json().messages;
    expect(
      (await request('GET', `/api/channels/${id}/messages?before=${latest[1].id}`, wife)).json().messages,
    ).toHaveLength(1);
    await request('DELETE', `/api/channels/${id}/messages/${latest[1].id}`, wife);
    expect((await request('GET', `/api/channels/${id}/messages`, wife)).json().messages).toHaveLength(2);
    await request('DELETE', `/api/channels/${id}/messages/${latest[0].id}`, owner);
    expect((await request('GET', `/api/channels/${id}/messages`, wife)).json().messages).toHaveLength(1);
  });
  it('consumes single-use invites atomically and rejects revoked/expired codes', async () => {
    const service = new CommunityService(db);
    const first = await createAccount('First');
    const second = await createAccount('Second');
    const { code } = await service.invite(owner.user.id, friends.id, 1, 1);
    const results = await Promise.allSettled([
      service.join(first.user.id, code),
      service.join(second.user.id, code),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const revoked = await service.invite(owner.user.id, friends.id, 1, 1);
    await db.query('UPDATE invitations SET revoked=true WHERE server_id=$1', [friends.id]);
    await expect(service.join(wife.user.id, revoked.code)).rejects.toThrow('invalid or expired');
    const expired = await service.invite(owner.user.id, friends.id, 1, 1);
    await db.query("UPDATE invitations SET expires_at=now()-interval '1 hour' WHERE server_id=$1", [
      friends.id,
    ]);
    await expect(service.join(wife.user.id, expired.code)).rejects.toThrow('invalid or expired');
  });
  it('rejects private ACL members from other servers and UUID injection', async () => {
    const service = new CommunityService(db);
    await expect(
      service.saveChannel(owner.user.id, couple.id, {
        name: 'bad',
        type: 'voice',
        private: true,
        memberIds: [friend.user.id],
        allowSpeak: true,
        allowShare: true,
        readOnly: false,
      }),
    ).rejects.toThrow('must belong');
    expect((await request('GET', '/api/servers/not-a-uuid', owner)).statusCode).toBe(400);
    expect((await request('GET', `/api/servers/${randomUUID()}`, owner)).statusCode).toBe(404);
  });
  it('removes active access after membership or session revocation', async () => {
    const account = await new AccountService(db).authenticate(wife.token);
    const channel = coupleDetail.channels.find((c) => c.type === 'voice')!;
    const client = {
      listRooms: async () => [{ name: voiceRoomName(channel.id) }],
      listParticipants: async () => [{ identity: `${wife.user.id}:${account.sessionId}` }],
      removeParticipant: vi.fn(async () => {}),
      updateParticipant: vi.fn(async () => {}),
    };
    const service = new CommunityService(db);
    const access = new VoiceAccessService(db, service, config, client);
    await access.reconcile();
    expect(client.updateParticipant).toHaveBeenCalled();
    expect(client.removeParticipant).not.toHaveBeenCalled();
    await service.setMember(owner.user.id, couple.id, wife.user.id, null);
    await access.reconcile();
    expect(client.removeParticipant).toHaveBeenCalled();
    expect((await request('POST', `/api/rooms/${channel.id}/token`, wife, {})).statusCode).toBe(404);
    expect((await request('GET', `/api/servers/${couple.id}`, wife)).statusCode).toBe(404);
  });
});

describe('LiveKit configuration and presence cache', () => {
  it('requires all self-hosted fields together', () => {
    expect(() =>
      loadConfiguration({
        LIVEKIT_URL: config.LIVEKIT_URL,
        LIVEKIT_API_KEY: 'key',
        LIVEKIT_API_SECRET: 'secret',
        SELF_HOSTED_LIVEKIT_URL: config.SELF_HOSTED_LIVEKIT_URL,
      }),
    ).toThrow();
  });
  it('keeps other rooms when one disappears and caches successful reads', async () => {
    let listings = 0;
    const source = new LiveKitPresenceSource(
      config,
      {
        listRooms: async () => {
          listings++;
          return [{ name: 'a' }, { name: 'b' }];
        },
        listParticipants: async (room) => {
          if (room === 'a') throw Error('gone');
          return [{ identity: 'b', name: 'B' }];
        },
      },
      60000,
    );
    expect(await source.read()).toEqual([
      { roomId: 'a', occupants: [] },
      { roomId: 'b', occupants: [{ identity: 'b', name: 'B' }] },
    ]);
    await source.read();
    expect(listings).toBe(1);
  });
});
