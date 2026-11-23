// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { WebSocket } from 'ws';
import { createServer } from '../../server/app';
import { TestDatabase } from '../helpers/database';
import type { RoomOccupancy } from '../../server/presence-service';
import type { AccountSession, CommunityDetail, DirectConversation } from '../../src/shared/community';
import { liveUnauthorized, type LiveEvent, type LiveRequest } from '../../src/shared/live';

let app: Awaited<ReturnType<typeof createServer>>;
let owner: AccountSession, friend: AccountSession, outsider: AccountSession, guest: AccountSession;
let serverId: string, channelId: string, voiceId: string;
let base = '';
let rooms: RoomOccupancy[] = [];
let address = 1;
const releaseSecret = 'release-hook-secret-for-the-tests-0123456789';
const open: WebSocket[] = [];
const call = (
  method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE',
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
      'x-forwarded-for': `10.40.0.${address++}`,
    },
  });

interface Client {
  socket: WebSocket;
  events: LiveEvent[];
  send(request: LiveRequest): void;
  next(match: (event: LiveEvent) => boolean, timeoutMs?: number): Promise<LiveEvent>;
  closed: Promise<number>;
}

async function connect(session?: AccountSession, token = session?.token): Promise<Client> {
  const socket = new WebSocket(`${base}/api/live`);
  open.push(socket);
  const events: LiveEvent[] = [];
  const waiting = new Set<{ match: (event: LiveEvent) => boolean; resolve(event: LiveEvent): void }>();
  socket.on('message', (data) => {
    const event = JSON.parse(String(data)) as LiveEvent;
    events.push(event);
    for (const waiter of waiting)
      if (waiter.match(event)) {
        waiting.delete(waiter);
        waiter.resolve(event);
      }
  });
  const closed = new Promise<number>((resolve) => socket.on('close', (code) => resolve(code)));
  await new Promise<void>((resolve, reject) => {
    socket.once('open', () => resolve());
    socket.once('error', reject);
  });
  const client: Client = {
    socket,
    events,
    closed,
    send: (request) => socket.send(JSON.stringify(request)),
    next: (match, timeoutMs = 4_000) => {
      const found = events.find(match);
      if (found) {
        events.splice(events.indexOf(found), 1);
        return Promise.resolve(found);
      }
      return new Promise((resolve, reject) => {
        const waiter = {
          match,
          resolve: (event: LiveEvent) => {
            clearTimeout(timer);
            events.splice(events.indexOf(event), 1);
            resolve(event);
          },
        };
        const timer = setTimeout(() => {
          waiting.delete(waiter);
          reject(new Error(`No matching event; saw ${JSON.stringify(events)}`));
        }, timeoutMs);
        waiting.add(waiter);
      });
    },
  };
  if (token) {
    client.send({ type: 'auth', token });
    if (session) await client.next((event) => event.type === 'ready');
  }
  return client;
}
const quiet = (ms = 400) => new Promise((resolve) => setTimeout(resolve, ms));

beforeAll(async () => {
  app = await createServer(
    {
      PORT: 0,
      HOST: '127.0.0.1',
      LIVEKIT_URL: 'wss://example.invalid',
      LIVEKIT_API_KEY: 'test',
      LIVEKIT_API_SECRET: 'test',
      RELEASE_HOOK_SECRET: releaseSecret,
    },
    { read: async () => rooms },
    new TestDatabase(),
  );
  await app.listen({ port: 0, host: '127.0.0.1' });
  base = `ws://127.0.0.1:${(app.server.address() as { port: number }).port}`;
  const register = async (username: string) =>
    (
      await call('POST', '/api/auth/register', undefined, {
        username,
        displayName: username[0].toUpperCase() + username.slice(1),
        password: 'Testing live events!',
      })
    ).json() as AccountSession;
  owner = await register('owner');
  friend = await register('friend');
  outsider = await register('outsider');
  guest = await register('guest');
  serverId = ((await call('POST', '/api/servers', owner, { name: 'Friends' })).json() as { id: string }).id;
  const invite = (
    await call('POST', `/api/servers/${serverId}/invites`, owner, { hours: 1, maxUses: 5 })
  ).json();
  await call('POST', '/api/invites/join', friend, { code: invite.code });
  const detail = (await call('GET', `/api/servers/${serverId}`, owner)).json() as CommunityDetail;
  channelId = detail.channels.find((channel) => channel.type === 'text')!.id;
  voiceId = detail.channels.find((channel) => channel.type === 'voice')!.id;
});
afterAll(async () => {
  for (const socket of open) socket.terminate();
  await app?.close();
});

describe('live events', () => {
  it('turns away a socket that does not sign in with a live session', async () => {
    const stranger = await connect(undefined, 'not-a-session');
    expect(await stranger.closed).toBe(liveUnauthorized);
  });

  it('tells the people watching a channel that a message arrived, and nobody else', async () => {
    const watcher = await connect(friend);
    const snoop = await connect(outsider);
    watcher.send({ type: 'watch', channelId });
    snoop.send({ type: 'watch', channelId });
    await quiet(200);
    expect(
      (await call('POST', `/api/channels/${channelId}/messages`, owner, { content: 'hi' })).statusCode,
    ).toBe(200);
    expect(await watcher.next((event) => event.type === 'channel')).toEqual({
      type: 'channel',
      channelId,
      authorId: owner.user.id,
    });
    await quiet();
    expect(snoop.events).toEqual([]);
    watcher.socket.close();
    snoop.socket.close();
  });

  it('tells every reader of a channel about a new message, and whether it names them', async () => {
    // Nobody here is watching the channel: the event reaches them anyway.
    const reader = await connect(friend);
    const writer = await connect(owner);
    const snoop = await connect(outsider);
    const sent = await call('POST', `/api/channels/${channelId}/messages`, owner, {
      content: `look <@${friend.user.id}>`,
    });
    const { id: messageId } = sent.json() as { id: string };
    expect(await reader.next((event) => event.type === 'message')).toEqual({
      type: 'message',
      serverId,
      channelId,
      messageId,
      authorId: owner.user.id,
      mentioned: true,
    });
    await call('POST', `/api/channels/${channelId}/messages`, owner, { content: 'nothing for you' });
    expect(await reader.next((event) => event.type === 'message')).toMatchObject({ mentioned: false });
    // Answering somebody tells them as if they were named.
    const asked = (
      (await call('POST', `/api/channels/${channelId}/messages`, friend, { content: 'ready?' })).json() as {
        id: string;
      }
    ).id;
    await call('POST', `/api/channels/${channelId}/messages`, owner, { content: 'yes', replyTo: asked });
    expect(
      await reader.next((event) => event.type === 'message' && event.authorId === owner.user.id),
    ).toMatchObject({
      mentioned: true,
    });
    await quiet();
    // Never about one's own words.
    expect(
      writer.events.filter((event) => event.type === 'message' && event.authorId === owner.user.id),
    ).toEqual([]);
    expect(snoop.events).toEqual([]);
    for (const client of [reader, writer, snoop]) client.socket.close();
  });

  it('passes typing on to the others in the channel, never back to the writer', async () => {
    const writer = await connect(friend);
    const reader = await connect(owner);
    const snoop = await connect(outsider);
    writer.send({ type: 'watch', channelId });
    reader.send({ type: 'watch', channelId });
    await quiet(200);
    writer.send({ type: 'typing', channelId });
    snoop.send({ type: 'typing', channelId });
    expect(await reader.next((event) => event.type === 'typing')).toEqual({
      type: 'typing',
      channelId,
      userId: friend.user.id,
      name: 'Friend',
    });
    await quiet();
    expect(writer.events.filter((event) => event.type === 'typing')).toEqual([]);
    expect(reader.events.filter((event) => event.type === 'typing')).toEqual([]);
    writer.socket.close();
    reader.socket.close();
    snoop.socket.close();
  });

  it('tells every member when the server changes, including somebody just removed', async () => {
    const member = await connect(friend);
    const snoop = await connect(outsider);
    await call('PATCH', `/api/servers/${serverId}`, owner, { name: 'Renamed' });
    expect(await member.next((event) => event.type === 'server')).toEqual({ type: 'server', serverId });

    const invite = (
      await call('POST', `/api/servers/${serverId}/invites`, owner, { hours: 1, maxUses: 1 })
    ).json();
    const joining = await connect(guest);
    await call('POST', '/api/invites/join', guest, { code: invite.code });
    expect(await joining.next((event) => event.type === 'servers')).toEqual({ type: 'servers' });
    expect(await member.next((event) => event.type === 'server')).toEqual({ type: 'server', serverId });

    expect(
      (await call('DELETE', `/api/servers/${serverId}/members/${guest.user.id}`, owner)).statusCode,
    ).toBe(200);
    expect(await joining.next((event) => event.type === 'server')).toEqual({ type: 'server', serverId });
    await quiet();
    expect(snoop.events).toEqual([]);
    member.socket.close();
    snoop.socket.close();
    joining.socket.close();
  });

  it('carries direct messages and typing between the two people only', async () => {
    const reader = await connect(friend);
    const snoop = await connect(outsider);
    const conversation = (
      (await call('POST', '/api/directs', owner, { username: 'friend' })).json() as {
        conversation: DirectConversation;
      }
    ).conversation;
    expect(await reader.next((event) => event.type === 'directs')).toEqual({ type: 'directs' });
    await call('POST', `/api/directs/${conversation.id}/messages`, owner, { content: 'psst' });
    expect(await reader.next((event) => event.type === 'directs')).toEqual({
      type: 'directs',
      conversationId: conversation.id,
      authorId: owner.user.id,
    });
    const writer = await connect(owner);
    writer.send({ type: 'typing', conversationId: conversation.id });
    snoop.send({ type: 'typing', conversationId: conversation.id });
    expect(await reader.next((event) => event.type === 'typing')).toMatchObject({
      conversationId: conversation.id,
      userId: owner.user.id,
    });
    await quiet();
    expect(snoop.events).toEqual([]);
    for (const client of [reader, snoop, writer]) client.socket.close();
  });

  it('notices people entering a voice room and tells the members of its server', async () => {
    const member = await connect(friend);
    const snoop = await connect(outsider);
    // The first look only learns what is there.
    await quiet(2_300);
    rooms = [{ roomId: `channel_${voiceId}`, occupants: [{ identity: 'someone', name: 'Someone' }] }];
    expect(await member.next((event) => event.type === 'presence', 5_000)).toEqual({
      type: 'presence',
      serverId,
    });
    expect(snoop.events).toEqual([]);
    member.socket.close();
    snoop.socket.close();
  });

  it('says who is here beside every member and conversation', async () => {
    const detail = (await call('GET', `/api/servers/${serverId}`, owner)).json() as CommunityDetail;
    expect(detail.members.find((member) => member.id === owner.user.id)?.online).toBe(true);
    expect(detail.members.every((member) => typeof member.online === 'boolean')).toBe(true);
    const { conversations } = (await call('GET', '/api/directs', friend)).json() as {
      conversations: DirectConversation[];
    };
    expect(conversations[0].peer.online).toBe(true);
  });

  it('tells every open app about a new release, when the workflow holds the secret', async () => {
    const one = await connect(friend);
    const other = await connect(outsider);
    const hook = (token: string, version: unknown) =>
      app.inject({
        method: 'POST',
        url: '/api/hooks/release',
        payload: { version },
        headers: { authorization: `Bearer ${token}`, 'x-forwarded-for': `10.40.1.${address++}` },
      });
    expect((await hook('guessing', '9.9.9')).statusCode).toBe(401);
    expect((await hook(owner.token, '9.9.9')).statusCode).toBe(401);
    expect((await hook(releaseSecret, '9.9.9; rm -rf /')).statusCode).toBe(400);
    const told = await hook(releaseSecret, '9.9.9');
    expect(told.statusCode).toBe(200);
    expect(told.json().told).toBeGreaterThanOrEqual(2);
    for (const client of [one, other])
      expect(await client.next((event) => event.type === 'release')).toEqual({
        type: 'release',
        version: '9.9.9',
      });
    one.socket.close();
    other.socket.close();
  });

  it('closes the connections of a session that signs out', async () => {
    const session = (
      await call('POST', '/api/auth/login', undefined, {
        username: 'friend',
        password: 'Testing live events!',
      })
    ).json() as AccountSession;
    const client = await connect(session);
    await call('POST', '/api/auth/logout', session);
    expect(await client.closed).toBe(liveUnauthorized);
  });
});
