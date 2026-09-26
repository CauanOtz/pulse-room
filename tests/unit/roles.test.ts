// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { TrackSource } from 'livekit-server-sdk';
import { AccountService } from '../../server/account-service';
import { migrate } from '../../server/database';
import type { AccountSession, Community, CommunityDetail, TagChoice } from '../../src/shared/community';
import { everyoneDefault, has, Permission } from '../../src/shared/permissions';
import { TestDatabase } from '../helpers/database';
import { startService } from '../helpers/service';

let service: Awaited<ReturnType<typeof startService>>;
let owner: AccountSession, admin: AccountSession, mod: AccountSession, vip: AccountSession, member: AccountSession;
let outsider: AccountSession;
let serverId: string;
let adminRole: string, modRole: string, vipRole: string, everyoneRole: string;

const call = (...args: Parameters<Awaited<ReturnType<typeof startService>>['request']>) => service.request(...args);
const status = async (...args: Parameters<typeof call>) => (await call(...args)).statusCode;
const role = (name: string, permissions: number, extra: Partial<{ colour: string | null; hoist: boolean }> = {}) => ({
  name,
  colour: extra.colour ?? null,
  permissions,
  hoist: extra.hoist ?? false,
});
const jwtOf = (token: string) => JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());
const channelNamed = (detail: CommunityDetail, name: string) => detail.channels.find((c) => c.name === name);

beforeAll(async () => {
  service = await startService();
  owner = await service.createAccount('owner');
  admin = await service.createAccount('admin');
  mod = await service.createAccount('mod');
  vip = await service.createAccount('vip');
  member = await service.createAccount('member');
  outsider = await service.createAccount('outsider');
  serverId = await service.serverWith('Pulse', owner, admin, mod, vip, member);
  // Created bottom-up, each new role landing at the bottom: VIP < Moderator < Admin.
  adminRole = (await call('POST', `/api/servers/${serverId}/roles`, owner, role('Admin', Permission.Administrator, { hoist: true }))).json().id;
  modRole = (
    await call(
      'POST',
      `/api/servers/${serverId}/roles`,
      owner,
      role(
        'Moderator',
        Permission.ManageRoles |
          Permission.ManageChannels |
          Permission.ManageMessages |
          Permission.KickMembers |
          Permission.TimeoutMembers |
          Permission.MuteMembers,
        { colour: '#6a5acd' },
      ),
    )
  ).json().id;
  vipRole = (await call('POST', `/api/servers/${serverId}/roles`, owner, role('VIP', 0))).json().id;
  for (const [session, roleId] of [
    [admin, adminRole],
    [mod, modRole],
    [vip, vipRole],
  ] as const)
    expect(
      await status('PUT', `/api/servers/${serverId}/members/${session.user.id}/roles`, owner, { roleIds: [roleId] }),
    ).toBe(200);
  everyoneRole = (await service.detail(owner, serverId)).roles!.find((r) => r.isDefault)!.id;
}, 60_000);

afterAll(async () => {
  await service?.app.close();
});

describe('roles', () => {
  it('starts every server with @everyone, allowed what a member could always do', async () => {
    const detail = await service.detail(member, serverId);
    const everyone = detail.roles!.find((r) => r.isDefault)!;
    expect(everyone).toMatchObject({ name: '@everyone', position: 0, permissions: everyoneDefault });
    expect(detail.server.permissions).toBe(everyoneDefault);
    expect(detail.server.role).toBe('member');
  });

  it('places each new role at the bottom, so the order they were made in is kept upside down', async () => {
    const detail = await service.detail(owner, serverId);
    expect(detail.roles!.map((r) => r.name)).toEqual(['Admin', 'Moderator', 'VIP', '@everyone']);
  });

  it('tells an older client who is an administrator, worked out from roles', async () => {
    const servers = (await call('GET', '/api/servers', admin)).json().servers as Community[];
    expect(servers.find((s) => s.id === serverId)?.role).toBe('admin');
    const detail = await service.detail(owner, serverId);
    expect(detail.members.find((m) => m.id === admin.user.id)?.role).toBe('admin');
    expect(detail.members.find((m) => m.id === mod.user.id)?.role).toBe('member');
    expect(detail.members.find((m) => m.id === mod.user.id)?.roleIds).toEqual([modRole]);
  });

  it('refuses roles to somebody without Manage roles', async () => {
    expect(await status('POST', `/api/servers/${serverId}/roles`, member, role('Mine', 0))).toBe(403);
    expect(
      await status('PUT', `/api/servers/${serverId}/members/${member.user.id}/roles`, member, { roleIds: [vipRole] }),
    ).toBe(403);
  });

  it('lets a moderator make roles, but never with a permission they do not have', async () => {
    expect(await status('POST', `/api/servers/${serverId}/roles`, mod, role('Banner', Permission.BanMembers))).toBe(
      403,
    );
    const helper = await call('POST', `/api/servers/${serverId}/roles`, mod, role('Helper', Permission.ManageMessages));
    expect(helper.statusCode).toBe(200);
    expect(await status('DELETE', `/api/servers/${serverId}/roles/${helper.json().id}`, mod)).toBe(200);
  });

  it('keeps a moderator off the roles at and above their own', async () => {
    for (const target of [adminRole, modRole])
      expect(
        await status('PATCH', `/api/servers/${serverId}/roles/${target}`, mod, role('Renamed', 0)),
      ).toBe(403);
    expect(await status('DELETE', `/api/servers/${serverId}/roles/${adminRole}`, mod)).toBe(403);
    expect(
      await status('PATCH', `/api/servers/${serverId}/roles/${vipRole}`, mod, role('VIP', 0, { colour: '#e8508a' })),
    ).toBe(200);
  });

  it('keeps a moderator from handing out a role at or above their own, or touching somebody above them', async () => {
    expect(
      await status('PUT', `/api/servers/${serverId}/members/${member.user.id}/roles`, mod, { roleIds: [adminRole] }),
    ).toBe(403);
    expect(
      await status('PUT', `/api/servers/${serverId}/members/${member.user.id}/roles`, mod, { roleIds: [modRole] }),
    ).toBe(403);
    expect(
      await status('PUT', `/api/servers/${serverId}/members/${admin.user.id}/roles`, mod, { roleIds: [] }),
    ).toBe(403);
    expect(
      await status('PUT', `/api/servers/${serverId}/members/${member.user.id}/roles`, mod, { roleIds: [vipRole] }),
    ).toBe(200);
    expect(
      await status('PUT', `/api/servers/${serverId}/members/${member.user.id}/roles`, mod, { roleIds: [] }),
    ).toBe(200);
  });

  it('lets nobody but the owner raise @everyone above what they hold', async () => {
    expect(
      await status('PATCH', `/api/servers/${serverId}/roles/${everyoneRole}`, mod, role('@everyone', Permission.BanMembers)),
    ).toBe(403);
  });

  it('refuses a role that is not one of this server’s', async () => {
    const elsewhere = await service.serverWith('Elsewhere', outsider);
    const foreign = (await service.detail(outsider, elsewhere)).roles![0].id;
    expect(
      await status('PUT', `/api/servers/${serverId}/members/${member.user.id}/roles`, owner, { roleIds: [foreign] }),
    ).toBe(400);
  });

  it('reorders only below the actor, and the roles above stay where they are', async () => {
    expect(
      await status('PUT', `/api/servers/${serverId}/roles`, mod, { roleIds: [adminRole, vipRole, modRole] }),
    ).toBe(403);
    expect(await status('PUT', `/api/servers/${serverId}/roles`, mod, { roleIds: [adminRole, modRole] })).toBe(400);
    expect(
      await status('PUT', `/api/servers/${serverId}/roles`, owner, { roleIds: [modRole, adminRole, vipRole] }),
    ).toBe(200);
    expect((await service.detail(owner, serverId)).roles!.map((r) => r.name)).toEqual([
      'Moderator',
      'Admin',
      'VIP',
      '@everyone',
    ]);
    // Back as it was, for the tests that follow.
    expect(
      await status('PUT', `/api/servers/${serverId}/roles`, owner, { roleIds: [adminRole, modRole, vipRole] }),
    ).toBe(200);
  });
});

describe('moderation', () => {
  let text: string, voice: string;
  beforeAll(async () => {
    const detail = await service.detail(owner, serverId);
    text = detail.channels.find((c) => c.type === 'text')!.id;
    voice = detail.channels.find((c) => c.type === 'voice')!.id;
  });

  it('kicks only people below you, and never the owner', async () => {
    expect(await status('DELETE', `/api/servers/${serverId}/members/${admin.user.id}`, mod)).toBe(403);
    expect(await status('DELETE', `/api/servers/${serverId}/members/${owner.user.id}`, admin)).toBe(403);
    expect(await status('DELETE', `/api/servers/${serverId}/members/${vip.user.id}`, member)).toBe(403);
    expect(await status('DELETE', `/api/servers/${serverId}/members/${mod.user.id}`, mod)).toBe(200);
    // Leaving is always allowed; coming back needs an invitation and gets no roles back.
    const { code } = (await call('POST', `/api/servers/${serverId}/invites`, owner, { maxUses: 1, hours: 1 })).json();
    expect(await status('POST', '/api/invites/join', mod, { code })).toBe(200);
    expect((await service.detail(owner, serverId)).members.find((m) => m.id === mod.user.id)?.roleIds).toEqual([]);
    expect(
      await status('PUT', `/api/servers/${serverId}/members/${mod.user.id}/roles`, owner, { roleIds: [modRole] }),
    ).toBe(200);
  });

  it('puts somebody in a timeout: reading and listening, not writing or talking', async () => {
    expect(
      await status('PATCH', `/api/servers/${serverId}/members/${member.user.id}/moderation`, vip, { timeoutMinutes: 5 }),
    ).toBe(403);
    expect(
      await status('PATCH', `/api/servers/${serverId}/members/${admin.user.id}/moderation`, mod, { timeoutMinutes: 5 }),
    ).toBe(403);
    expect(
      await status('PATCH', `/api/servers/${serverId}/members/${member.user.id}/moderation`, mod, { timeoutMinutes: 5 }),
    ).toBe(200);

    const sent = await call('POST', `/api/channels/${text}/messages`, member, { content: 'let me talk' });
    expect(sent.statusCode).toBe(403);
    expect(sent.json().error).toContain('timeout');
    expect(await status('GET', `/api/channels/${text}/messages`, member)).toBe(200);
    const token = jwtOf((await call('POST', `/api/rooms/${voice}/token`, member, {})).json().token);
    expect(token.video.canPublishSources ?? []).not.toContain('microphone');
    expect(token.video.canSubscribe).toBe(true);
    expect((await service.detail(owner, serverId)).members.find((m) => m.id === member.user.id)?.timeoutUntil).toBeTruthy();

    expect(
      await status('PATCH', `/api/servers/${serverId}/members/${member.user.id}/moderation`, mod, { timeoutMinutes: null }),
    ).toBe(200);
    expect(await status('POST', `/api/channels/${text}/messages`, member, { content: 'thanks' })).toBe(200);
  });

  it('mutes and deafens in the call itself, now rather than at the next sweep', async () => {
    const account = member.user.id;
    service.voice.rooms = [{ name: `channel_${voice}`, participants: [{ identity: await identity(member) }] }];
    expect(
      await status('PATCH', `/api/servers/${serverId}/members/${account}/moderation`, mod, { deafened: true }),
    ).toBe(403);
    expect(await status('PATCH', `/api/servers/${serverId}/members/${account}/moderation`, mod, { muted: true })).toBe(
      200,
    );
    const token = jwtOf((await call('POST', `/api/rooms/${voice}/token`, member, {})).json().token);
    expect(token.video.canPublishSources ?? []).not.toContain('microphone');
    expect(
      await status('PATCH', `/api/servers/${serverId}/members/${account}/moderation`, admin, { deafened: true }),
    ).toBe(200);
    expect(jwtOf((await call('POST', `/api/rooms/${voice}/token`, member, {})).json().token).video.canSubscribe).toBe(
      false,
    );
    expect(
      await status('PATCH', `/api/servers/${serverId}/members/${account}/moderation`, admin, {
        muted: false,
        deafened: false,
      }),
    ).toBe(200);
    const restored = jwtOf((await call('POST', `/api/rooms/${voice}/token`, member, {})).json().token).video;
    expect(restored.canSubscribe).toBe(true);
    expect(restored.canPublishSources).toContain('microphone');
    service.voice.rooms = [];
  });

  it('takes somebody out of a call only with Disconnect members, and only below you', async () => {
    service.voice.rooms = [{ name: `channel_${voice}`, participants: [{ identity: `${vip.user.id}:session` }] }];
    service.voice.removeParticipant.mockClear();
    expect(await status('POST', `/api/servers/${serverId}/members/${vip.user.id}/disconnect`, mod)).toBe(403);
    expect(await status('POST', `/api/servers/${serverId}/members/${owner.user.id}/disconnect`, admin)).toBe(403);
    expect(await status('POST', `/api/servers/${serverId}/members/${vip.user.id}/disconnect`, admin)).toBe(200);
    expect(service.voice.removeParticipant).toHaveBeenCalledWith(`channel_${voice}`, `${vip.user.id}:session`);
    service.voice.rooms = [];
  });

  it('bans: out now, refused at every invitation, and back only when lifted', async () => {
    const guest = await service.createAccount('guest');
    const { code } = (await call('POST', `/api/servers/${serverId}/invites`, owner, { maxUses: 5, hours: 1 })).json();
    expect(await status('POST', '/api/invites/join', guest, { code })).toBe(200);
    expect(await status('POST', `/api/servers/${serverId}/bans`, mod, { userId: guest.user.id })).toBe(403);
    expect(
      await status('POST', `/api/servers/${serverId}/bans`, admin, { userId: guest.user.id, reason: 'spam' }),
    ).toBe(200);
    expect(await status('GET', `/api/servers/${serverId}`, guest)).toBe(404);
    const refused = await call('POST', '/api/invites/join', guest, { code });
    expect(refused.statusCode).toBe(403);
    expect(refused.json().error).toContain('banned');
    const bans = (await call('GET', `/api/servers/${serverId}/bans`, admin)).json().bans;
    expect(bans).toEqual([expect.objectContaining({ userId: guest.user.id, reason: 'spam' })]);
    expect(await status('GET', `/api/servers/${serverId}/bans`, mod)).toBe(403);
    expect(await status('DELETE', `/api/servers/${serverId}/bans/${guest.user.id}`, admin)).toBe(200);
    expect(await status('POST', '/api/invites/join', guest, { code })).toBe(200);
  });

  it('never bans the owner, or anybody from above', async () => {
    expect(await status('POST', `/api/servers/${serverId}/bans`, admin, { userId: owner.user.id })).toBe(403);
    expect(await status('POST', `/api/servers/${serverId}/bans`, owner, { userId: owner.user.id })).toBe(403);
  });
});

/** How somebody appears in a call: their account and the session that joined. */
async function identity(session: AccountSession) {
  return `${session.user.id}:${(await new AccountService(service.db).authenticate(session.token)).sessionId}`;
}

describe('channel permissions', () => {
  let staff: string;

  it('hides a channel from @everyone and shows it to the roles let in', async () => {
    staff = (await call('POST', `/api/servers/${serverId}/channels`, owner, { name: 'staff', type: 'text' })).json().id;
    expect(
      await status('PUT', `/api/channels/${staff}/overrides`, owner, {
        overrides: [
          { targetType: 'role', targetId: everyoneRole, allow: 0, deny: Permission.ViewChannels },
          { targetType: 'role', targetId: modRole, allow: Permission.ViewChannels, deny: 0 },
        ],
      }),
    ).toBe(200);
    expect(channelNamed(await service.detail(member, serverId), 'staff')).toBeUndefined();
    expect(await status('GET', `/api/channels/${staff}/messages`, member)).toBe(404);
    expect(channelNamed(await service.detail(mod, serverId), 'staff')).toBeDefined();
    // Administrator sees it without being named.
    expect(channelNamed(await service.detail(admin, serverId), 'staff')).toBeDefined();
    // An older client reads it as private.
    expect(channelNamed(await service.detail(owner, serverId), 'staff')?.private).toBe(true);
  });

  it('lets a person be denied what their role allows, and an older client reads it as read-only', async () => {
    const detail = await service.detail(owner, serverId);
    const current = channelNamed(detail, 'staff')!.overrides!;
    expect(
      await status('PUT', `/api/channels/${staff}/overrides`, owner, {
        overrides: [...current, { targetType: 'member', targetId: mod.user.id, allow: 0, deny: Permission.SendMessages }],
      }),
    ).toBe(200);
    const seen = channelNamed(await service.detail(mod, serverId), 'staff')!;
    expect(has(seen.permissions!, Permission.SendMessages)).toBe(false);
    expect(seen.readOnly).toBe(true);
    expect(await status('POST', `/api/channels/${staff}/messages`, mod, { content: 'hi' })).toBe(403);
    // Back to inherit: the override goes, and the role decides again.
    expect(await status('PUT', `/api/channels/${staff}/overrides`, owner, { overrides: current })).toBe(200);
    expect(await status('POST', `/api/channels/${staff}/messages`, mod, { content: 'hi' })).toBe(200);
  });

  it('keeps a moderator’s changes below them and within what they may do there', async () => {
    const current = channelNamed(await service.detail(mod, serverId), 'staff')!.overrides!;
    // A role above.
    expect(
      await status('PUT', `/api/channels/${staff}/overrides`, mod, {
        overrides: [...current, { targetType: 'role', targetId: adminRole, allow: 0, deny: Permission.SendMessages }],
      }),
    ).toBe(403);
    // A permission they do not hold.
    expect(
      await status('PUT', `/api/channels/${staff}/overrides`, mod, {
        overrides: [
          ...current,
          { targetType: 'role', targetId: vipRole, allow: Permission.DisconnectMembers, deny: 0 },
        ],
      }),
    ).toBe(403);
    // Below them, with what they hold: fine.
    expect(
      await status('PUT', `/api/channels/${staff}/overrides`, mod, {
        overrides: [...current, { targetType: 'role', targetId: vipRole, allow: Permission.ViewChannels, deny: 0 }],
      }),
    ).toBe(200);
    expect(channelNamed(await service.detail(vip, serverId), 'staff')).toBeDefined();
  });

  it('refuses a server-wide permission, one allowed and denied at once, or a role from elsewhere', async () => {
    const bad = [
      { targetType: 'role', targetId: everyoneRole, allow: Permission.KickMembers, deny: 0 },
      { targetType: 'role', targetId: everyoneRole, allow: Permission.SendMessages, deny: Permission.SendMessages },
      { targetType: 'role', targetId: '00000000-0000-4000-8000-000000000000', allow: 0, deny: Permission.SendMessages },
      { targetType: 'member', targetId: outsider.user.id, allow: 0, deny: Permission.SendMessages },
    ];
    for (const override of bad)
      expect(await status('PUT', `/api/channels/${staff}/overrides`, owner, { overrides: [override] })).toBe(400);
  });

  it('takes the call away from somebody denied Connect, and the microphone from somebody denied Speak', async () => {
    const lounge = (await call('POST', `/api/servers/${serverId}/channels`, owner, { name: 'quiet', type: 'voice' })).json().id;
    expect(
      await status('PUT', `/api/channels/${lounge}/overrides`, owner, {
        overrides: [
          { targetType: 'role', targetId: everyoneRole, allow: 0, deny: Permission.Speak },
          { targetType: 'member', targetId: member.user.id, allow: 0, deny: Permission.Connect },
        ],
      }),
    ).toBe(200);
    expect(await status('POST', `/api/rooms/${lounge}/token`, member, {})).toBe(403);
    const token = jwtOf((await call('POST', `/api/rooms/${lounge}/token`, vip, {})).json().token);
    expect(token.video.canPublishSources).not.toContain('microphone');
    expect(token.video.canPublishSources).toContain('screen_share');
    // The sweep enforces the same on somebody already inside with an older token.
    service.voice.rooms = [{ name: `channel_${lounge}`, participants: [{ identity: await identity(vip) }] }];
    service.voice.updateParticipant.mockClear();
    expect(await status('PATCH', `/api/channels/${lounge}`, owner, { name: 'quiet', type: 'voice' })).toBe(200);
    await vi.waitFor(() => expect(service.voice.updateParticipant).toHaveBeenCalled());
    const [, , , permission] = service.voice.updateParticipant.mock.calls.at(-1)! as unknown as [
      string,
      string,
      unknown,
      { canPublishSources: TrackSource[] },
    ];
    expect(permission.canPublishSources).not.toContain(TrackSource.MICROPHONE);
    service.voice.rooms = [];
  });
});

describe('categories', () => {
  let category: string, inside: string, other: string;

  it('lets channels inside a category follow its permissions', async () => {
    category = (await call('POST', `/api/servers/${serverId}/categories`, owner, { name: 'STAFF' })).json().id;
    expect(
      await status('PUT', `/api/categories/${category}/overrides`, owner, {
        overrides: [
          { targetType: 'role', targetId: everyoneRole, allow: 0, deny: Permission.ViewChannels },
          { targetType: 'role', targetId: modRole, allow: Permission.ViewChannels, deny: 0 },
        ],
      }),
    ).toBe(200);
    inside = (
      await call('POST', `/api/servers/${serverId}/channels`, owner, { name: 'logs', type: 'text', categoryId: category })
    ).json().id;
    other = (
      await call('POST', `/api/servers/${serverId}/channels`, owner, { name: 'staff-chat', type: 'text', categoryId: category })
    ).json().id;
    const seen = await service.detail(owner, serverId);
    expect(channelNamed(seen, 'logs')).toMatchObject({ categoryId: category, synced: true });
    expect(channelNamed(await service.detail(member, serverId), 'logs')).toBeUndefined();
    expect(channelNamed(await service.detail(mod, serverId), 'logs')).toBeDefined();
    // A category with nothing a member can see is not shown to them at all.
    expect((await service.detail(member, serverId)).categories).toEqual([]);
    expect((await service.detail(mod, serverId)).categories?.map((c) => c.name)).toEqual(['STAFF']);
  });

  it('carries a change to the category into every synced channel', async () => {
    expect(
      await status('PUT', `/api/categories/${category}/overrides`, owner, {
        overrides: [{ targetType: 'role', targetId: everyoneRole, allow: 0, deny: Permission.SendMessages }],
      }),
    ).toBe(200);
    const seen = await service.detail(member, serverId);
    expect(channelNamed(seen, 'logs')?.readOnly).toBe(true);
    expect(channelNamed(seen, 'staff-chat')?.readOnly).toBe(true);
  });

  it('stops following once a channel has permissions of its own, until synced again', async () => {
    expect(await status('PUT', `/api/channels/${other}/overrides`, owner, { overrides: [] })).toBe(200);
    expect(channelNamed(await service.detail(owner, serverId), 'staff-chat')?.synced).toBe(false);
    expect(channelNamed(await service.detail(member, serverId), 'staff-chat')?.readOnly).toBe(false);
    expect(
      await status('PUT', `/api/categories/${category}/overrides`, owner, {
        overrides: [{ targetType: 'role', targetId: everyoneRole, allow: 0, deny: Permission.ViewChannels }],
      }),
    ).toBe(200);
    expect(channelNamed(await service.detail(member, serverId), 'staff-chat')).toBeDefined();
    expect(channelNamed(await service.detail(member, serverId), 'logs')).toBeUndefined();

    expect(await status('POST', `/api/channels/${other}/sync`, owner)).toBe(200);
    expect(channelNamed(await service.detail(member, serverId), 'staff-chat')).toBeUndefined();
    expect(channelNamed(await service.detail(owner, serverId), 'staff-chat')?.synced).toBe(true);
  });

  it('syncs a channel moved into a category, and keeps its permissions when moved out', async () => {
    const loose = (await call('POST', `/api/servers/${serverId}/channels`, owner, { name: 'loose', type: 'text' })).json().id;
    expect(channelNamed(await service.detail(member, serverId), 'loose')).toBeDefined();
    expect(await status('PATCH', `/api/channels/${loose}`, owner, { name: 'loose', type: 'text', categoryId: category })).toBe(200);
    expect(channelNamed(await service.detail(member, serverId), 'loose')).toBeUndefined();
    expect(await status('PATCH', `/api/channels/${loose}`, owner, { name: 'loose', type: 'text', categoryId: null })).toBe(200);
    const moved = channelNamed(await service.detail(owner, serverId), 'loose')!;
    expect(moved).toMatchObject({ categoryId: null, synced: false });
    expect(channelNamed(await service.detail(member, serverId), 'loose')).toBeUndefined();
  });

  it('deletes a category without opening what it kept private', async () => {
    expect(await status('DELETE', `/api/categories/${category}`, mod)).toBe(200);
    const seen = await service.detail(owner, serverId);
    expect(seen.categories?.some((c) => c.id === category)).toBe(false);
    expect(channelNamed(seen, 'logs')).toMatchObject({ categoryId: null, synced: false });
    expect(channelNamed(await service.detail(member, serverId), 'logs')).toBeUndefined();
  });

  it('keeps categories to people who manage channels', async () => {
    expect(await status('POST', `/api/servers/${serverId}/categories`, member, { name: 'MINE' })).toBe(403);
    expect(
      await status('POST', `/api/servers/${serverId}/channels`, member, { name: 'mine', type: 'text' }),
    ).toBe(403);
  });
});

describe('server tags', () => {
  let open: string, staffOnly: string, winner: string;
  const tag = (text: string, mode: string, roleIds: string[] = [], name = '') => ({
    text,
    badge: 'star',
    colour: '#FFCC00',
    name,
    mode,
    roleIds,
  });
  const wornBy = async (session: AccountSession, who: AccountSession, id = serverId) =>
    (await service.detail(session, id)).members.find((m) => m.id === who.user.id)?.tag ?? null;

  it('are made by people with Manage tags', async () => {
    expect(await status('POST', `/api/servers/${serverId}/tags`, mod, tag('OTK', 'everyone'))).toBe(403);
    open = (await call('POST', `/api/servers/${serverId}/tags`, owner, tag('OTK', 'everyone', [], 'Friends'))).json().id;
    staffOnly = (await call('POST', `/api/servers/${serverId}/tags`, owner, tag('DEV', 'roles', [modRole]))).json().id;
    winner = (await call('POST', `/api/servers/${serverId}/tags`, owner, tag('WIN', 'assigned'))).json().id;
    const listed = (await service.detail(member, serverId)).tags!;
    expect(listed.map((t) => [t.text, t.mode])).toEqual([
      ['OTK', 'everyone'],
      ['DEV', 'roles'],
      ['WIN', 'assigned'],
    ]);
    expect(listed[0]).toMatchObject({ colour: '#ffcc00', name: 'Friends' });
  });

  it('refuses a tag that is too long, not letters, has an unknown badge, or needs roles and names none', async () => {
    for (const bad of [
      tag('FIVES', 'everyone'),
      tag('a b', 'everyone'),
      { ...tag('OK', 'everyone'), badge: 'unicorn' },
      tag('OK', 'roles', []),
      tag('OK', 'sometimes'),
    ])
      expect(await status('POST', `/api/servers/${serverId}/tags`, owner, bad)).toBe(400);
  });

  it('lets anybody wear an open tag, only role holders a role tag, and only holders an assigned one', async () => {
    expect(await status('PUT', `/api/servers/${serverId}/worn-tag`, member, { tagId: open })).toBe(200);
    expect(await status('PUT', `/api/servers/${serverId}/worn-tag`, member, { tagId: staffOnly })).toBe(403);
    expect(await status('PUT', `/api/servers/${serverId}/worn-tag`, member, { tagId: winner })).toBe(403);
    expect(await status('PUT', `/api/servers/${serverId}/worn-tag`, mod, { tagId: staffOnly })).toBe(200);
    expect(await status('PUT', `/api/servers/${serverId}/worn-tag`, outsider, { tagId: open })).toBe(404);

    expect(await status('PUT', `/api/tags/${winner}/holders/${member.user.id}`, mod)).toBe(403);
    expect(await status('PUT', `/api/tags/${open}/holders/${member.user.id}`, owner)).toBe(400);
    expect(await status('PUT', `/api/tags/${winner}/holders/${member.user.id}`, owner)).toBe(200);
    expect(await status('PUT', `/api/servers/${serverId}/worn-tag`, member, { tagId: winner })).toBe(200);
    // One tag a server: the second replaced the first.
    expect((await wornBy(owner, member))?.text).toBe('WIN');
  });

  it('shows a tag only in the server it belongs to', async () => {
    const elsewhere = await service.serverWith('Other room', owner, member);
    expect((await wornBy(owner, member))?.text).toBe('WIN');
    expect(await wornBy(owner, member, elsewhere)).toBeNull();
    expect((await call('GET', '/api/auth/me', member)).json().user.tag).toBeNull();
  });

  it('offers each person, server by server, the tags they may wear and the one they do', async () => {
    const choices = (await call('GET', '/api/account/tags', member)).json().choices as TagChoice[];
    const here = choices.find((choice) => choice.serverId === serverId)!;
    expect(here.tags.map((t) => t.text)).toEqual(['OTK', 'WIN']);
    expect(here.activeId).toBe(winner);
    const staffChoices = (await call('GET', '/api/account/tags', mod)).json().choices as TagChoice[];
    expect(staffChoices.find((choice) => choice.serverId === serverId)!.tags.map((t) => t.text)).toEqual([
      'OTK',
      'DEV',
    ]);
  });

  it('takes a tag off whoever can no longer wear it, and it does not come back on its own', async () => {
    expect(await status('DELETE', `/api/tags/${winner}/holders/${member.user.id}`, owner)).toBe(200);
    expect(await wornBy(owner, member)).toBeNull();
    expect(await status('PUT', `/api/tags/${winner}/holders/${member.user.id}`, owner)).toBe(200);
    expect(await wornBy(owner, member)).toBeNull();

    // Losing the role the tag needs.
    expect((await wornBy(owner, mod))?.text).toBe('DEV');
    expect(
      await status('PUT', `/api/servers/${serverId}/members/${mod.user.id}/roles`, owner, { roleIds: [] }),
    ).toBe(200);
    expect(await wornBy(owner, mod)).toBeNull();
    expect(
      await status('PUT', `/api/servers/${serverId}/members/${mod.user.id}/roles`, owner, { roleIds: [modRole] }),
    ).toBe(200);
    expect(await wornBy(owner, mod)).toBeNull();
  });

  it('takes a tag off everybody when its rule narrows or it is deleted', async () => {
    expect(await status('PUT', `/api/servers/${serverId}/worn-tag`, member, { tagId: open })).toBe(200);
    expect(await status('PATCH', `/api/tags/${open}`, owner, tag('OTK', 'roles', [vipRole]))).toBe(200);
    expect(await wornBy(owner, member)).toBeNull();
    expect(await status('PUT', `/api/servers/${serverId}/worn-tag`, vip, { tagId: open })).toBe(200);
    expect(await status('DELETE', `/api/tags/${open}`, owner)).toBe(200);
    expect(await wornBy(owner, vip)).toBeNull();
  });

  it('can be taken off by choice', async () => {
    expect(await status('PUT', `/api/servers/${serverId}/worn-tag`, mod, { tagId: staffOnly })).toBe(200);
    expect(await status('PUT', `/api/servers/${serverId}/worn-tag`, mod, { tagId: null })).toBe(200);
    expect(await wornBy(owner, mod)).toBeNull();
  });

  it('grants nothing: wearing a staff tag opens no channel', async () => {
    const detail = await service.detail(owner, serverId);
    const everyonePermissions = detail.roles!.find((r) => r.isDefault)!.permissions;
    expect(everyonePermissions).toBe(everyoneDefault);
    expect(await status('PUT', `/api/servers/${serverId}/worn-tag`, vip, { tagId: winner })).toBe(403);
  });
});

describe('carrying an existing server across', () => {
  it('turns administrators, private and restricted channels and the single tag into roles, overrides and tags', async () => {
    const db = new TestDatabase();
    await migrate(db);
    // Wind the database back to before roles, then fill it the way the last
    // version did, and migrate again.
    await db.query(`
      DROP TABLE IF EXISTS member_tags, tag_holders, tag_roles, server_tags, bans,
        category_overrides, channel_overrides, member_roles, roles CASCADE;
      ALTER TABLE channels DROP COLUMN IF EXISTS category_id;
      DROP TABLE IF EXISTS categories CASCADE;
      DELETE FROM schema_migrations WHERE version = 5;
    `);
    const ids = {
      server: '11111111-1111-4111-8111-111111111111',
      owner: '22222222-2222-4222-8222-222222222222',
      admin: '33333333-3333-4333-8333-333333333333',
      member: '44444444-4444-4444-8444-444444444444',
      secret: '55555555-5555-4555-8555-555555555555',
      news: '66666666-6666-4666-8666-666666666666',
    };
    for (const [id, name] of [
      [ids.owner, 'own'],
      [ids.admin, 'adm'],
      [ids.member, 'mem'],
    ])
      await db.query(
        "INSERT INTO accounts(id, username, display_name, password_hash, recovery_hash) VALUES($1,$2,$2,'x','y')",
        [id, name],
      );
    await db.query(
      "INSERT INTO communities(id, name, tag_text, tag_badge, tag_colour) VALUES($1,'Old','OLD','star','#123456')",
      [ids.server],
    );
    for (const [account, roleName] of [
      [ids.owner, 'owner'],
      [ids.admin, 'admin'],
      [ids.member, 'member'],
    ])
      await db.query('INSERT INTO memberships(server_id, account_id, role) VALUES($1,$2,$3)', [
        ids.server,
        account,
        roleName,
      ]);
    await db.query("UPDATE accounts SET tag_server_id=$1 WHERE id=$2", [ids.server, ids.member]);
    await db.query(
      "INSERT INTO channels(id, server_id, name, type, private, allow_speak) VALUES($1,$2,'secret','voice',true,false)",
      [ids.secret, ids.server],
    );
    await db.query("INSERT INTO channel_members(channel_id, account_id) VALUES($1,$2)", [ids.secret, ids.member]);
    await db.query(
      "INSERT INTO channels(id, server_id, name, type, read_only) VALUES($1,$2,'news','text',true)",
      [ids.news, ids.server],
    );

    await migrate(db);
    await migrate(db); // Twice is the same as once.

    const { CommunityService } = await import('../../server/community-service');
    const communities = new CommunityService(db);
    const asAdmin = await communities.detail(ids.admin, ids.server);
    expect(asAdmin.roles!.map((r) => r.name)).toEqual(['Admin', '@everyone']);
    expect(asAdmin.server.role).toBe('admin');
    expect(has(asAdmin.server.permissions!, Permission.Administrator)).toBe(true);

    const asMember = await communities.detail(ids.member, ids.server);
    const secret = asMember.channels.find((c) => c.id === ids.secret)!;
    expect(secret.private).toBe(true);
    expect(secret.allowSpeak).toBe(false);
    expect(asMember.channels.find((c) => c.id === ids.news)!.readOnly).toBe(true);
    expect(asMember.members.find((m) => m.id === ids.member)?.tag).toMatchObject({ text: 'OLD', serverId: ids.server });
    expect(asMember.tags).toEqual([expect.objectContaining({ text: 'OLD', mode: 'everyone' })]);

    // Nobody else was let into the private channel by the move.
    await db.query('INSERT INTO accounts(id, username, display_name, password_hash, recovery_hash) VALUES($1,$2,$2,$3,$3)', [
      '77777777-7777-4777-8777-777777777777',
      'late',
      'x',
    ]);
    await db.query("INSERT INTO memberships(server_id, account_id, role) VALUES($1,$2,'member')", [
      ids.server,
      '77777777-7777-4777-8777-777777777777',
    ]);
    const asLate = await communities.detail('77777777-7777-4777-8777-777777777777', ids.server);
    expect(asLate.channels.some((c) => c.id === ids.secret)).toBe(false);
    await db.close();
  });
});
