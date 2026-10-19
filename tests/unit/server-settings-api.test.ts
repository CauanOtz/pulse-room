// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createServer } from '../../server/app';
import { migrate } from '../../server/database';
import { landingChannel } from '../../src/renderer/domain/landing-channel';
import type { AccountSession, CommunityDetail } from '../../src/shared/community';
import { Permission } from '../../src/shared/permissions';
import { TestDatabase } from '../helpers/database';
import { png } from '../helpers/images';

let app: Awaited<ReturnType<typeof createServer>>;
let db: TestDatabase;
let owner: AccountSession, friend: AccountSession, newcomer: AccountSession, outsider: AccountSession;
let address = 1;
const call = (
  method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE',
  url: string,
  user = owner,
  payload?: unknown,
  binary = false,
) =>
  app.inject({
    method,
    url,
    payload: payload as never,
    headers: {
      authorization: `Bearer ${user.token}`,
      'x-forwarded-for': `10.40.0.${address++}`,
      ...(binary ? { 'content-type': 'image/png' } : {}),
    },
  });
const detail = async (id: string, user = owner) =>
  (await call('GET', `/api/servers/${id}`, user)).json() as CommunityDetail;
const create = async () => {
  const { id } = (await call('POST', '/api/servers', owner, { name: 'Just us' })).json() as { id: string };
  const { code } = (
    await call('POST', `/api/servers/${id}/invites`, owner, { hours: 1, maxUses: 10 })
  ).json() as { code: string };
  await call('POST', '/api/invites/join', friend, { code });
  return { id, code, base: `/api/servers/${id}`, current: await detail(id) };
};
const upload = async (id: string, kind = 'banner', user = owner, bytes = png(600, 60, 60, 60, 240)) =>
  call('POST', `/api/servers/${id}/appearance-images?kind=${kind}`, user, bytes, true);

beforeAll(async () => {
  db = new TestDatabase();
  app = await createServer(
    {
      PORT: 0,
      HOST: '127.0.0.1',
      LIVEKIT_URL: 'wss://example.invalid',
      LIVEKIT_API_KEY: 'test',
      LIVEKIT_API_SECRET: 'test',
    },
    { read: async () => [] },
    db,
  );
  const register = async (username: string) =>
    (
      await app.inject({
        method: 'POST',
        url: '/api/auth/register',
        payload: { username, displayName: username, password: 'Testing server appearance!' },
      })
    ).json() as AccountSession;
  owner = await register('owner');
  friend = await register('friend');
  newcomer = await register('newcomer');
  outsider = await register('outsider');
});
afterAll(async () => app?.close());

describe('server identity and onboarding', () => {
  it('uses the existing Manage server role permission and keeps staged pictures scoped to their uploader', async () => {
    const { id, base } = await create();
    const role = (
      await call('POST', `${base}/roles`, owner, {
        name: 'Steward',
        colour: null,
        permissions: Permission.ManageServer,
        hoist: false,
      })
    ).json() as { id: string };
    await db.query('INSERT INTO member_roles(server_id,account_id,role_id) VALUES($1,$2,$3)', [
      id,
      friend.user.id,
      role.id,
    ]);
    const managerBanner = png(600, 101, 101, 101, 240);
    const { imageId } = (await upload(id, 'banner', owner, managerBanner)).json() as { imageId: string };
    expect((await call('PATCH', base, friend, { bannerId: imageId })).statusCode).toBe(422);
    expect((await upload(id, 'banner', friend, managerBanner)).statusCode).toBe(200);
    expect(
      (await call('PATCH', base, friend, { description: 'Edited by a steward.', bannerId: imageId }))
        .statusCode,
    ).toBe(200);
    expect((await detail(id)).server.description).toBe('Edited by a steward.');
    expect((await call('DELETE', base, friend)).statusCode).toBe(403);
    const hidden = (
      await call('POST', `${base}/channels`, owner, {
        name: 'staff',
        type: 'text',
        private: true,
        memberIds: [],
        allowSpeak: true,
        allowShare: true,
        readOnly: false,
      })
    ).json() as { id: string };
    const managerView = await detail(id, friend);
    expect(managerView.channels.map((channel) => channel.id)).not.toContain(hidden.id);
    expect(managerView.channelCount).toBe(3);
    // Removing an expired staging reference must not delete the live banner.
    await db.query(
      "UPDATE server_image_uploads SET created_at=now()-interval '25 hours' WHERE server_id=$1",
      [id],
    );
    expect((await upload(id, 'welcomeBanner', friend, png(600, 95, 95, 95, 240))).statusCode).toBe(200);
    expect((await call('GET', `/api/images/${imageId}`, friend)).statusCode).toBe(200);
  });
  it('persists identity, date, landing channel and welcome message without changing other fields', async () => {
    const { id, base, current } = await create();
    const text = current.channels.find((channel) => channel.type === 'text')!;
    expect(
      (
        await call('PATCH', base, owner, {
          name: 'Our room',
          description: 'A quiet place.',
          welcomeMessage: 'Welcome, say hello!',
          landingChannelId: text.id,
        })
      ).statusCode,
    ).toBe(200);
    const saved = await detail(id);
    expect(saved.server).toMatchObject({
      name: 'Our room',
      description: 'A quiet place.',
      welcomeMessage: 'Welcome, say hello!',
      landingChannelId: text.id,
    });
    expect(new Date(saved.server.createdAt!).getTime()).toBeGreaterThan(0);
    expect(saved.members).toHaveLength(2);
    expect(saved.channels).toHaveLength(2);
    expect(saved.landingChannelIds).toEqual([text.id]);
    expect((await detail(id, friend)).landingChannelIds).toBeUndefined();
    expect((await call('PATCH', base, owner, { name: 'Renamed by an older client' })).statusCode).toBe(200);
    expect((await detail(id)).server.description).toBe('A quiet place.');
    expect((await detail(id, friend)).welcomePending).toBe(false);
  });
  it('validates bounds and denies settings and uploads without Manage server', async () => {
    const { id, base } = await create();
    for (const payload of [
      { name: ' ' },
      { name: 'x'.repeat(61) },
      { description: 'x'.repeat(201) },
      { welcomeMessage: 'x'.repeat(301) },
      { landingChannelId: 'bad' },
      { invented: true },
      {},
    ])
      expect((await call('PATCH', base, owner, payload)).statusCode).toBe(400);
    expect((await call('PATCH', base, friend, { description: 'Not allowed' })).statusCode).toBe(403);
    expect((await call('PATCH', base, outsider, { description: 'Not allowed' })).statusCode).toBe(404);
    const count = (await db.query<{ count: string }>('SELECT count(*) FROM images')).rows[0].count;
    expect((await upload(id, 'banner', friend)).statusCode).toBe(403);
    expect((await upload(id, 'banner', outsider)).statusCode).toBe(404);
    expect((await db.query<{ count: string }>('SELECT count(*) FROM images')).rows[0].count).toBe(count);
  });
  it('rejects voice, foreign and restricted landing channels, including category overrides', async () => {
    const { id, base, current } = await create();
    const everyone = current.roles!.find((role) => role.isDefault)!;
    const voice = current.channels.find((channel) => channel.type === 'voice')!;
    const other = await create();
    for (const landingChannelId of [voice.id, other.current.channels[0].id])
      expect((await call('PATCH', base, owner, { landingChannelId })).statusCode).toBe(422);
    const category = (await call('POST', `${base}/categories`, owner, { name: 'Private' })).json() as {
      id: string;
    };
    // Use actual category overrides rather than the legacy private flag.
    await db.query(
      "INSERT INTO category_overrides(category_id,target_type,target_id,deny) VALUES($1,'role',$2,$3)",
      [category.id, everyone.id, Permission.ViewChannels],
    );
    const channel = (
      await call('POST', `${base}/channels`, owner, { name: 'staff', type: 'text', categoryId: category.id })
    ).json() as { id: string };
    await db.query('UPDATE channels SET permissions_synced=true WHERE id=$1', [channel.id]);
    expect((await call('PATCH', base, owner, { landingChannelId: channel.id })).statusCode).toBe(422);
    expect((await detail(id)).landingChannelIds).not.toContain(channel.id);
  });
  it('stages artwork privately, saves atomically, and removes unreferenced pictures', async () => {
    const { id, base } = await create();
    const staged = await upload(id);
    expect(staged.statusCode).toBe(200);
    const { imageId } = staged.json() as { imageId: string };
    expect((await detail(id)).server.bannerId).toBeNull();
    expect((await call('GET', `/api/images/${imageId}`, friend)).statusCode).toBe(404);
    expect((await call('GET', `/api/images/${imageId}`, owner)).statusCode).toBe(200);
    const other = await create();
    expect((await call('PATCH', other.base, owner, { bannerId: imageId })).statusCode).toBe(422);
    expect((await call('PATCH', base, owner, { name: 'Should roll back', iconId: imageId })).statusCode).toBe(
      422,
    );
    expect((await detail(id)).server.name).toBe('Just us');
    expect((await call('PATCH', base, owner, { bannerId: imageId })).statusCode).toBe(200);
    expect((await call('GET', `/api/images/${imageId}`, friend)).statusCode).toBe(200);
    expect((await call('GET', `/api/images/${imageId}`, outsider)).statusCode).toBe(404);
    expect((await call('PATCH', base, owner, { bannerId: null })).statusCode).toBe(200);
    expect((await call('GET', `/api/images/${imageId}`, owner)).statusCode).toBe(404);
    expect((await upload(id, 'banner', owner, png(32))).statusCode).toBe(422);
  });
  it('keeps separate welcome artwork and shared image references intact', async () => {
    const { id, base } = await create();
    const bytes = png(600, 80, 80, 80, 240);
    const { imageId } = (await upload(id, 'banner', owner, bytes)).json();
    await upload(id, 'welcomeBanner', owner, bytes);
    await call('PATCH', base, owner, { bannerId: imageId, welcomeBannerId: imageId });
    await call('PATCH', base, owner, { bannerId: null });
    expect((await detail(id)).server).toMatchObject({ bannerId: null, welcomeBannerId: imageId });
    expect((await call('GET', `/api/images/${imageId}`, friend)).statusCode).toBe(200);
    await call('PATCH', base, owner, { welcomeBannerId: null });
    expect((await call('GET', `/api/images/${imageId}`, friend)).statusCode).toBe(404);
  });
  it('welcomes new members once, survives migrations and acknowledges without chat duplicates', async () => {
    const { id, base, code } = await create();
    await call('PATCH', base, owner, { description: 'Our room.', welcomeMessage: 'Welcome aboard!' });
    expect((await detail(id)).welcomePending).toBe(false);
    expect((await detail(id, friend)).welcomePending).toBe(false);
    await call('POST', '/api/invites/join', newcomer, { code });
    expect((await detail(id, newcomer)).welcomePending).toBe(true);
    await migrate(db);
    expect((await detail(id, newcomer)).welcomePending).toBe(true);
    expect((await call('POST', `${base}/welcome/ack`, outsider)).statusCode).toBe(404);
    for (let index = 0; index < 2; index++)
      expect((await call('POST', `${base}/welcome/ack`, newcomer)).statusCode).toBe(200);
    await call('POST', '/api/invites/join', newcomer, { code });
    expect((await detail(id, newcomer)).welcomePending).toBe(false);
    expect(
      Number(
        (
          await db.query<{ count: string }>(
            'SELECT count(*) FROM messages m JOIN channels c ON c.id=m.channel_id WHERE c.server_id=$1',
            [id],
          )
        ).rows[0].count,
      ),
    ).toBe(0);
  });
  it('falls back when the initial channel is deleted or no longer accessible', async () => {
    const { id, base, current } = await create();
    const channel = (
      await call('POST', `${base}/channels`, owner, { name: 'welcome', type: 'text' })
    ).json() as { id: string };
    await call('PATCH', base, owner, { landingChannelId: channel.id });
    expect(landingChannel(await detail(id, friend))?.id).toBe(channel.id);
    const everyone = current.roles!.find((role) => role.isDefault)!;
    await db.query(
      "INSERT INTO channel_overrides(channel_id,target_type,target_id,deny) VALUES($1,'role',$2,$3)",
      [channel.id, everyone.id, Permission.ViewChannels],
    );
    expect((await detail(id, friend)).server.landingChannelId).toBeNull();
    expect(landingChannel(await detail(id, friend))?.name).toBe('general');
    expect((await call('DELETE', `/api/channels/${channel.id}`)).statusCode).toBe(200);
    expect((await detail(id)).server.landingChannelId).toBeNull();
    expect(landingChannel(await detail(id))?.name).toBe('general');
  });
});
