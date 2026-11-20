// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createServer } from '../../server/app';
import { TestDatabase } from '../helpers/database';
import type {
  AccountSession,
  Community,
  DirectConversation,
  DirectMessage,
} from '../../src/shared/community';

let app: Awaited<ReturnType<typeof createServer>>;
let owner: AccountSession, friend: AccountSession, stranger: AccountSession, member: AccountSession;
let serverId: string;
let address = 1;
const call = (method: 'GET' | 'POST' | 'DELETE', url: string, session?: AccountSession, payload?: unknown) =>
  app.inject({
    method,
    url,
    payload: payload as never,
    headers: {
      ...(session ? { authorization: `Bearer ${session.token}` } : {}),
      'x-forwarded-for': `10.30.0.${address++}`,
    },
  });
const conversations = async (session: AccountSession) =>
  ((await call('GET', '/api/directs', session)).json() as { conversations: DirectConversation[] })
    .conversations;
const messages = async (session: AccountSession, conversationId: string) =>
  (
    (await call('GET', `/api/directs/${conversationId}/messages`, session)).json() as {
      messages: DirectMessage[];
    }
  ).messages;
const servers = async (session: AccountSession) =>
  ((await call('GET', '/api/servers', session)).json() as { servers: Community[] }).servers;
const inviteBy = (session: AccountSession, username: string, note?: string) =>
  call('POST', `/api/servers/${serverId}/invites/direct`, session, { username, ...(note ? { note } : {}) });

beforeAll(async () => {
  app = await createServer(
    {
      PORT: 0,
      HOST: '127.0.0.1',
      LIVEKIT_URL: 'wss://example.invalid',
      LIVEKIT_API_KEY: 'test',
      LIVEKIT_API_SECRET: 'test',
    },
    { read: async () => [] },
    new TestDatabase(),
  );
  const register = async (username: string) =>
    (
      await call('POST', '/api/auth/register', undefined, {
        username,
        displayName: username[0].toUpperCase() + username.slice(1),
        password: 'Testing direct messages!',
      })
    ).json() as AccountSession;
  owner = await register('owner');
  friend = await register('friend');
  stranger = await register('stranger');
  member = await register('member');
  serverId = ((await call('POST', '/api/servers', owner, { name: 'Late nights' })).json() as { id: string })
    .id;
  const code = (
    await call('POST', `/api/servers/${serverId}/invites`, owner, { hours: 1, maxUses: 1 })
  ).json().code as string;
  await call('POST', '/api/invites/join', member, { code });
});
afterAll(async () => app?.close());

describe('direct messages', () => {
  it('opens one conversation per pair, by username, and shows it to the other side once written in', async () => {
    const opened = await call('POST', '/api/directs', owner, { username: 'Friend' });
    expect(opened.statusCode).toBe(200);
    const conversation = (opened.json() as { conversation: DirectConversation }).conversation;
    expect(conversation.peer).toMatchObject({ username: 'friend', displayName: 'Friend' });
    const again = (await call('POST', '/api/directs', friend, { username: 'owner' })).json() as {
      conversation: DirectConversation;
    };
    expect(again.conversation.id).toBe(conversation.id);

    expect((await call('POST', '/api/directs', owner, { username: 'nobody_here' })).statusCode).toBe(404);
    expect((await call('POST', '/api/directs', owner, { username: 'owner' })).statusCode).toBe(400);
    expect((await call('GET', '/api/directs')).statusCode).toBe(401);
  });

  it('delivers messages, counts what is unread and clears it on reading', async () => {
    const [conversation] = await conversations(owner);
    const sent = await call('POST', `/api/directs/${conversation.id}/messages`, owner, {
      content: '  hi there  ',
    });
    expect((sent.json() as { message: DirectMessage }).message).toMatchObject({
      content: 'hi there',
      kind: 'text',
    });
    expect(
      (await call('POST', `/api/directs/${conversation.id}/messages`, owner, { content: '   ' })).statusCode,
    ).toBe(400);

    const [incoming] = await conversations(friend);
    expect(incoming.unread).toBe(1);
    expect(incoming.lastMessage).toMatchObject({ content: 'hi there', invite: false });
    expect((await conversations(owner))[0].unread).toBe(0);
    await call('POST', `/api/directs/${conversation.id}/read`, friend);
    expect((await conversations(friend))[0].unread).toBe(0);
    expect((await messages(friend, conversation.id)).map((message) => message.content)).toEqual(['hi there']);
  });

  it('keeps a conversation private to its two people', async () => {
    const [conversation] = await conversations(owner);
    expect((await call('GET', `/api/directs/${conversation.id}/messages`, stranger)).statusCode).toBe(404);
    expect(
      (await call('POST', `/api/directs/${conversation.id}/messages`, stranger, { content: 'let me in' }))
        .statusCode,
    ).toBe(404);
    expect(await conversations(stranger)).toEqual([]);
  });
});

describe('server invitations sent as messages', () => {
  it('needs the permission to invite, and refuses people already inside', async () => {
    expect((await inviteBy(member, 'stranger')).statusCode).toBe(403);
    expect((await inviteBy(owner, 'member')).statusCode).toBe(409);
    expect((await inviteBy(owner, 'owner')).statusCode).toBe(400);
    expect((await inviteBy(owner, 'ghost_account')).statusCode).toBe(404);
  });

  it('arrives as a card the invitee accepts, which makes them a member', async () => {
    const sent = await inviteBy(owner, 'stranger', 'Come play tonight');
    expect(sent.statusCode).toBe(200);
    const { conversationId, message } = sent.json() as { conversationId: string; message: DirectMessage };
    expect(message).toMatchObject({ kind: 'invite', content: 'Come play tonight' });
    expect(message.invite).toMatchObject({ status: 'pending', serverName: 'Late nights', memberCount: 2 });

    const [incoming] = await conversations(stranger);
    expect(incoming).toMatchObject({ id: conversationId, unread: 1 });
    expect(incoming.lastMessage?.invite).toBe(true);

    // Only the person invited can answer.
    expect((await call('POST', `/api/direct-invites/${message.invite!.id}/accept`, friend)).statusCode).toBe(
      404,
    );
    const accepted = await call('POST', `/api/direct-invites/${message.invite!.id}/accept`, stranger);
    expect(accepted.json()).toEqual({ serverId });
    expect((await servers(stranger)).map((server) => server.id)).toContain(serverId);
    const [card] = await messages(stranger, conversationId);
    expect(card.invite).toMatchObject({ status: 'accepted', memberCount: 3 });
    expect(
      (await call('POST', `/api/direct-invites/${message.invite!.id}/accept`, stranger)).statusCode,
    ).toBe(409);
  });

  it('lets the invitee decline, and the sender withdraw a waiting invitation', async () => {
    const first = (await inviteBy(owner, 'friend')).json() as { message: DirectMessage };
    await call('POST', `/api/direct-invites/${first.message.invite!.id}/decline`, friend);
    expect((await servers(friend)).map((server) => server.id)).not.toContain(serverId);

    const second = (await inviteBy(owner, 'friend')).json() as { message: DirectMessage };
    // A newer invitation replaces one still waiting.
    const third = (await inviteBy(owner, 'friend')).json() as {
      conversationId: string;
      message: DirectMessage;
    };
    expect(
      (await call('POST', `/api/direct-invites/${second.message.invite!.id}/accept`, friend)).statusCode,
    ).toBe(410);
    expect(
      (await call('POST', `/api/direct-invites/${third.message.invite!.id}/revoke`, friend)).statusCode,
    ).toBe(409);
    expect(
      (await call('POST', `/api/direct-invites/${third.message.invite!.id}/revoke`, owner)).statusCode,
    ).toBe(200);
    const statuses = (await messages(friend, third.conversationId))
      .filter((entry) => entry.kind === 'invite')
      .map((entry) => entry.invite?.status);
    expect(statuses).toEqual(['declined', 'revoked', 'revoked']);
  });

  it('keeps banned people out even with an invitation in hand', async () => {
    const drifter = (
      await call('POST', '/api/auth/register', undefined, {
        username: 'drifter',
        displayName: 'Drifter',
        password: 'Testing direct messages!',
      })
    ).json() as AccountSession;
    const waiting = (await inviteBy(owner, 'drifter')).json() as { message: DirectMessage };
    // They come in another way first, and are banned before they answer.
    const code = (
      await call('POST', `/api/servers/${serverId}/invites`, owner, { hours: 1, maxUses: 1 })
    ).json().code as string;
    await call('POST', '/api/invites/join', drifter, { code });
    const banned = await call('POST', `/api/servers/${serverId}/bans`, owner, {
      userId: drifter.user.id,
      reason: '',
    });
    expect(banned.statusCode).toBe(200);
    expect(
      (await call('POST', `/api/direct-invites/${waiting.message.invite!.id}/accept`, drifter)).statusCode,
    ).toBe(403);
    expect((await servers(drifter)).map((server) => server.id)).not.toContain(serverId);
    expect((await inviteBy(owner, 'drifter')).statusCode).toBe(409);
  });
});
