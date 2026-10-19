// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createServer } from '../../server/app';
import { attachmentMime } from '../../server/chat-service';
import { TestDatabase } from '../helpers/database';
import { png } from '../helpers/images';
import type {
  AccountSession,
  ChatAttachment,
  ChatMessage,
  CommunityDetail,
} from '../../src/shared/community';
import { messageLinks } from '../../src/shared/chat';

let app: Awaited<ReturnType<typeof createServer>>;
let owner: AccountSession, friend: AccountSession, outsider: AccountSession;
let channelId: string, lockedId: string, privateId: string;
let address = 1;
const call = (
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  url: string,
  session?: AccountSession,
  payload?: unknown,
  binary = false,
) =>
  app.inject({
    method,
    url,
    payload: payload as never,
    headers: {
      ...(session ? { authorization: `Bearer ${session.token}` } : {}),
      ...(binary ? { 'content-type': 'application/octet-stream' } : {}),
      'x-forwarded-for': `10.20.0.${address++}`,
    },
  });
const bytes = png(32, 32);
const upload = async (session = owner, channel = channelId) =>
  call(
    'POST',
    `/api/channels/${channel}/attachments?name=portrait.png&type=image%2Fpng`,
    session,
    bytes,
    true,
  );

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
        displayName: username,
        password: 'Testing rich conversations!',
      })
    ).json() as AccountSession;
  owner = await register('owner');
  friend = await register('friend');
  outsider = await register('outsider');
  const server = (await call('POST', '/api/servers', owner, { name: 'Friends' })).json() as { id: string };
  const invite = (
    await call('POST', `/api/servers/${server.id}/invites`, owner, { hours: 1, maxUses: 2 })
  ).json();
  await call('POST', '/api/invites/join', friend, { code: invite.code });
  const detail = (await call('GET', `/api/servers/${server.id}`, owner)).json() as CommunityDetail;
  channelId = detail.channels.find((channel) => channel.type === 'text')!.id;
  const create = async (name: string, privateChannel: boolean, readOnly: boolean) =>
    (
      await call('POST', `/api/servers/${server.id}/channels`, owner, {
        name,
        type: 'text',
        private: privateChannel,
        memberIds: [],
        allowSpeak: true,
        allowShare: true,
        readOnly,
      })
    ).json() as { id: string };
  lockedId = (await create('announcements', false, true)).id;
  privateId = (await create('private', true, false)).id;
});
afterAll(async () => app?.close());

describe('chat media and reactions', () => {
  it('keeps uploads private until attached, checks ownership and serves them only to channel members', async () => {
    const response = await upload();
    expect(response.statusCode).toBe(200);
    const file = response.json() as ChatAttachment;
    expect(file).toMatchObject({ name: 'portrait.png', mime: 'image/png', size: bytes.length });
    expect((await call('GET', `/api/channels/${channelId}/attachments/${file.id}`, friend)).statusCode).toBe(
      404,
    );
    expect(
      (await call('POST', `/api/channels/${channelId}/messages`, friend, { attachmentIds: [file.id] }))
        .statusCode,
    ).toBe(400);
    expect(
      (await call('POST', `/api/channels/${privateId}/messages`, owner, { attachmentIds: [file.id] }))
        .statusCode,
    ).toBe(400);
    expect(
      (
        await call('POST', `/api/channels/${channelId}/messages`, owner, {
          content: '',
          attachmentIds: [file.id],
        })
      ).statusCode,
    ).toBe(200);
    const read = await call('GET', `/api/channels/${channelId}/attachments/${file.id}`, friend);
    expect(read.statusCode).toBe(200);
    expect(read.rawPayload.equals(bytes)).toBe(true);
    expect(read.headers['content-type']).toContain('image/png');
    expect(read.headers['x-content-type-options']).toBe('nosniff');
    expect([403, 404]).toContain(
      (await call('GET', `/api/channels/${channelId}/attachments/${file.id}`, outsider)).statusCode,
    );
    expect((await call('GET', `/api/channels/${channelId}/attachments/${file.id}`)).statusCode).toBe(401);
    const messages = (await call('GET', `/api/channels/${channelId}/messages`, friend)).json()
      .messages as ChatMessage[];
    expect(messages.at(-1)?.attachments).toEqual([file]);
    const library = (await call('GET', `/api/channels/${channelId}/resources?kind=media`, friend)).json();
    expect(library.media).toContainEqual(expect.objectContaining({ id: file.id, authorName: 'owner' }));
    expect(
      (await call('POST', `/api/channels/${channelId}/messages`, owner, { attachmentIds: [file.id] }))
        .statusCode,
    ).toBe(400);
    await call('DELETE', `/api/channels/${channelId}/messages/${messages.at(-1)!.id}`, owner);
    expect((await call('GET', `/api/channels/${channelId}/attachments/${file.id}`, owner)).statusCode).toBe(
      404,
    );
    expect(
      (await call('GET', `/api/channels/${channelId}/resources?kind=media`, friend)).json().media,
    ).toHaveLength(0);
  });

  it('enforces sending rights on uploads and reactions, including private and read-only channels', async () => {
    expect((await upload(friend, lockedId)).statusCode).toBe(403);
    expect([403, 404]).toContain((await upload(friend, privateId)).statusCode);
    expect(
      (await call('POST', `/api/channels/${lockedId}/messages`, owner, { content: 'Read only' })).statusCode,
    ).toBe(200);
    const message = (await call('GET', `/api/channels/${lockedId}/messages`, friend)).json().messages[0];
    expect(
      (
        await call('PUT', `/api/channels/${lockedId}/messages/${message.id}/reactions`, friend, {
          emoji: '👍',
        })
      ).statusCode,
    ).toBe(403);
  });

  it('counts each person once per emoji, allows removing only their own reaction and survives reads', async () => {
    await call('POST', `/api/channels/${channelId}/messages`, owner, { content: 'React here' });
    const message = (await call('GET', `/api/channels/${channelId}/messages`, owner)).json().messages.at(-1);
    const path = `/api/channels/${channelId}/messages/${message.id}/reactions`;
    await call('PUT', path, owner, { emoji: '👍' });
    await call('PUT', path, owner, { emoji: '👍' });
    expect((await call('PUT', path, friend, { emoji: '👍' })).json().reactions).toEqual([
      { emoji: '👍', count: 2, mine: true },
    ]);
    expect((await call('DELETE', path, owner, { emoji: '👍' })).json().reactions).toEqual([
      { emoji: '👍', count: 1, mine: false },
    ]);
    expect(
      (await call('GET', `/api/channels/${channelId}/messages`, owner)).json().messages.at(-1).reactions,
    ).toEqual([{ emoji: '👍', count: 1, mine: false }]);
    expect((await call('PUT', path, owner, { emoji: '<script>' })).statusCode).toBe(400);
    expect([403, 404]).toContain((await call('PUT', path, outsider, { emoji: '👍' })).statusCode);
    await call('DELETE', `/api/channels/${channelId}/messages/${message.id}`, owner);
    expect((await call('PUT', path, friend, { emoji: '👍' })).statusCode).toBe(404);
  });

  it('extracts web links without fetching remote content and rejects unsupported uploads and empty messages', async () => {
    await call('POST', `/api/channels/${channelId}/messages`, owner, {
      content: 'Read https://example.com/docs?q=1 and www.example.org. javascript:alert(1)',
    });
    const library = (await call('GET', `/api/channels/${channelId}/resources?kind=links`, friend)).json();
    expect(library.links.map((link: { url: string }) => link.url)).toEqual([
      'https://example.com/docs?q=1',
      'https://www.example.org/',
    ]);
    expect(
      (await call('POST', `/api/channels/${channelId}/messages`, owner, { content: ' ' })).statusCode,
    ).toBe(400);
    expect(
      (
        await call(
          'POST',
          `/api/channels/${channelId}/attachments?name=bad.svg&type=image%2Fsvg%2Bxml`,
          owner,
          Buffer.from('<svg onload="alert(1)"/>'),
          true,
        )
      ).statusCode,
    ).toBe(415);
    const file = (await upload()).json() as ChatAttachment;
    await call('DELETE', `/api/channels/${channelId}/attachments/${file.id}`, owner);
    expect((await call('GET', `/api/channels/${channelId}/attachments/${file.id}`, owner)).statusCode).toBe(
      404,
    );
  });
});

describe('passive attachment types and clickable URLs', () => {
  it('classifies common audio and video containers by signature', () => {
    expect(attachmentMime(Buffer.from('RIFF0000WAVE0000'), '')).toBe('audio/wav');
    expect(attachmentMime(Buffer.from('0000ftypM4A 0000'), 'audio/mp4')).toBe('audio/mp4');
    expect(attachmentMime(Buffer.from('0000ftypisom0000'), 'video/mp4')).toBe('video/mp4');
    expect(attachmentMime(Buffer.from('%PDF-1.7\n'), '')).toBe('application/pdf');
    expect(() => attachmentMime(Buffer.alloc(0), 'image/png')).toThrow();
    expect(() => attachmentMime(Buffer.from('MZnot an image'), 'image/png')).toThrow();
  });
  it('leaves executable protocols, credentials and trailing punctuation out of links', () => {
    const links = messageLinks(
      'hello (https://example.com/docs). https://example.org/a_(b) www.example.net! https://u:p@example.org javascript:alert(1) file:///C:/secret',
    );
    expect(links.map((link) => link.url)).toEqual([
      'https://example.com/docs',
      'https://example.org/a_(b)',
      'https://www.example.net/',
    ]);
    expect(messageLinks('WWW.EXAMPLE.COM').map((link) => link.url)).toEqual(['https://www.example.com/']);
  });
});
