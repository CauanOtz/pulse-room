// @vitest-environment node
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AccountSession, Role } from '../../src/shared/community';
import { Permission } from '../../src/shared/permissions';
import { migrate } from '../../server/database';
import { png, svg } from '../helpers/images';
import { startService } from '../helpers/service';

let service: Awaited<ReturnType<typeof startService>>;
let owner: AccountSession,
  moderator: AccountSession,
  friend: AccountSession,
  neighbour: AccountSession,
  outsider: AccountSession;
beforeAll(async () => {
  service = await startService();
  owner = await service.createAccount('owner');
  moderator = await service.createAccount('moderator');
  friend = await service.createAccount('friend');
  neighbour = await service.createAccount('neighbour');
  outsider = await service.createAccount('outsider');
}, 60_000);
afterAll(async () => service?.app.close());
const create = async (server: string, name: string, permissions = 0, description = '') => {
  const result = await service.request('POST', `/api/servers/${server}/roles`, owner, {
    name,
    permissions,
    description,
    colour: null,
    hoist: false,
  });
  expect(result.statusCode).toBe(200);
  return result.json().id as string;
};
const read = async (server: string, role: string): Promise<Role> =>
  (await service.detail(owner, server)).roles!.find((entry) => entry.id === role)!;
const upload = (server: string, role: string, bytes: Buffer, session = owner) =>
  service.app.inject({
    method: 'POST',
    url: `/api/servers/${server}/roles/${role}/icon`,
    headers: { authorization: `Bearer ${session.token}`, 'content-type': 'application/octet-stream' },
    payload: bytes,
  });
const image = (id: string, session = owner) => service.request('GET', `/api/images/${id}`, session);

describe('role identity and concurrent editing', () => {
  it('persists descriptions and optional fields without breaking legacy edits; migration is repeatable', async () => {
    const server = await service.serverWith('Identity', owner, friend);
    const role = await create(
      server,
      'Helpers',
      Permission.SendMessages,
      'People who keep conversations welcoming.',
    );
    const initial = await read(server, role);
    expect(initial).toMatchObject({
      description: 'People who keep conversations welcoming.',
      iconId: null,
      revision: 1,
    });
    expect(
      (
        await service.request('PATCH', `/api/servers/${server}/roles/${role}`, owner, {
          name: 'Hosts',
          colour: '#5144f6',
          hoist: true,
          permissions: Permission.SendMessages,
        })
      ).statusCode,
    ).toBe(200);
    expect(await read(server, role)).toMatchObject({
      name: 'Hosts',
      description: initial.description,
      revision: 2,
    });
    await migrate(service.db);
    await migrate(service.db);
    expect(await read(server, role)).toMatchObject({ description: initial.description, revision: 2 });
    const profile = (await service.request('GET', `/api/servers/${server}`, friend)).json();
    expect(profile.roles.find((entry: Role) => entry.id === role)).toMatchObject({
      description: initial.description,
    });
  });

  it('rejects stale revisions without overwriting a newer edit', async () => {
    const server = await service.serverWith('Revisions', owner);
    const role = await create(server, 'Helpers');
    const endpoint = `/api/servers/${server}/roles/${role}`;
    expect(
      (
        await service.request('PATCH', endpoint, owner, {
          description: 'Changed elsewhere',
          expectedRevision: 1,
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (await service.request('PATCH', endpoint, owner, { name: 'Stale edit', expectedRevision: 1 }))
        .statusCode,
    ).toBe(409);
    expect(await read(server, role)).toMatchObject({
      name: 'Helpers',
      description: 'Changed elsewhere',
      revision: 2,
    });
    expect(
      (await service.request('PATCH', endpoint, owner, { name: 'Reviewed edit', expectedRevision: 2 }))
        .statusCode,
    ).toBe(200);
    expect(await read(server, role)).toMatchObject({
      name: 'Reviewed edit',
      description: 'Changed elsewhere',
      revision: 3,
    });
  });

  it('validates bounds and keeps @everyone protected', async () => {
    const server = await service.serverWith('Validation', owner, friend);
    const role = await create(server, 'Helpers');
    const endpoint = `/api/servers/${server}/roles/${role}`;
    for (const payload of [
      { name: ' ' },
      { name: 'x'.repeat(33) },
      { description: 'x'.repeat(201) },
      { expectedRevision: 1 },
      { iconId: 'bad' },
    ])
      expect((await service.request('PATCH', endpoint, owner, payload)).statusCode).toBe(400);
    expect((await service.request('PATCH', endpoint, friend, { description: 'Not mine' })).statusCode).toBe(
      403,
    );
    const everyone = (await service.detail(owner, server)).roles!.find((entry) => entry.isDefault)!;
    expect(
      (
        await service.request('PATCH', `/api/servers/${server}/roles/${everyone.id}`, owner, {
          description: 'Fake identity',
        })
      ).statusCode,
    ).toBe(400);
    expect(
      (await service.request('DELETE', `/api/servers/${server}/roles/${everyone.id}`, owner)).statusCode,
    ).toBe(400);
    expect((await upload(server, everyone.id, png(64))).statusCode).toBe(400);
  });

  it('stages safe icons for the intended role, authorizes reads, replaces and collects them', async () => {
    const server = await service.serverWith('Icons', owner, friend);
    const role = await create(server, 'Helpers'),
      other = await create(server, 'Guests');
    const endpoint = `/api/servers/${server}/roles/${role}`;
    expect((await upload(server, role, svg)).statusCode).toBe(415);
    expect((await upload(server, role, Buffer.alloc(2_097_153))).statusCode).toBe(413);
    expect((await upload(server, role, png(64), friend)).statusCode).toBe(403);
    const staged = await upload(server, role, png(64));
    expect(staged.statusCode).toBe(200);
    const first = staged.json().imageId;
    expect((await image(first, owner)).statusCode).toBe(200);
    expect((await image(first, friend)).statusCode).toBe(404);
    expect(
      (await service.request('PATCH', `/api/servers/${server}/roles/${other}`, owner, { iconId: first }))
        .statusCode,
    ).toBe(422);
    expect((await service.request('PATCH', endpoint, owner, { iconId: first })).statusCode).toBe(200);
    expect((await image(first, friend)).statusCode).toBe(200);
    expect((await image(first, outsider)).statusCode).toBe(404);
    const second = (await upload(server, role, png(64, 90, 90, 90))).json().imageId;
    expect((await service.request('PATCH', endpoint, owner, { iconId: second })).statusCode).toBe(200);
    expect((await image(first)).statusCode).toBe(404);
    expect((await read(server, role)).iconId).toBe(second);
    expect((await service.request('PATCH', endpoint, owner, { iconId: null })).statusCode).toBe(200);
    expect((await image(second)).statusCode).toBe(404);
    const third = (await upload(server, role, png(64, 130, 130, 130))).json().imageId;
    await service.request('PATCH', endpoint, owner, { iconId: third });
    expect((await service.request('DELETE', endpoint, owner)).statusCode).toBe(200);
    expect((await image(third)).statusCode).toBe(404);
    expect((await service.db.query('SELECT id FROM images WHERE id=$1', [third])).rows).toHaveLength(0);
  });
});

describe('role memberships and hierarchy', () => {
  it('adds several members atomically and preserves their other roles', async () => {
    const server = await service.serverWith('Membership', owner, friend, neighbour);
    const role = await create(server, 'Hosts'),
      other = await create(server, 'Readers');
    await service.request('PUT', `/api/servers/${server}/members/${friend.user.id}/roles`, owner, {
      roleIds: [other],
    });
    const endpoint = `/api/servers/${server}/roles/${role}/members`;
    expect(
      (await service.request('PATCH', endpoint, owner, { addUserIds: [friend.user.id, randomUUID()] }))
        .statusCode,
    ).toBe(404);
    expect(
      (await service.detail(owner, server)).members.find((entry) => entry.id === friend.user.id)?.roleIds,
    ).toEqual([other]);
    for (let repeat = 0; repeat < 2; repeat++)
      expect(
        (await service.request('PATCH', endpoint, owner, { addUserIds: [friend.user.id, neighbour.user.id] }))
          .statusCode,
      ).toBe(200);
    expect(
      (await service.detail(owner, server)).members.find((entry) => entry.id === friend.user.id)?.roleIds,
    ).toEqual(expect.arrayContaining([role, other]));
    expect(
      (await service.request('PATCH', endpoint, owner, { removeUserIds: [friend.user.id] })).statusCode,
    ).toBe(200);
    expect(
      (await service.detail(owner, server)).members.find((entry) => entry.id === friend.user.id)?.roleIds,
    ).toEqual([other]);
    expect(
      (
        await service.request('PATCH', endpoint, owner, {
          addUserIds: [neighbour.user.id],
          removeUserIds: [neighbour.user.id],
        })
      ).statusCode,
    ).toBe(400);
    const everyone = (await service.detail(owner, server)).roles!.find((entry) => entry.isDefault)!;
    expect(
      (
        await service.request('PATCH', `/api/servers/${server}/roles/${everyone.id}/members`, owner, {
          removeUserIds: [friend.user.id],
        })
      ).statusCode,
    ).toBe(400);
  });

  it('blocks lower-role privilege escalation through both assignment contracts and protected peers', async () => {
    const server = await service.serverWith('Security', owner, moderator, friend);
    const manager = await create(server, 'Role manager', Permission.ManageRoles);
    const dangerous = await create(server, 'Lower administrator', Permission.Administrator);
    await service.request('PUT', `/api/servers/${server}/members/${moderator.user.id}/roles`, owner, {
      roleIds: [manager],
    });
    const base = `/api/servers/${server}`;
    expect(
      (
        await service.request('PATCH', `${base}/roles/${dangerous}/members`, moderator, {
          addUserIds: [moderator.user.id],
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (
        await service.request('PUT', `${base}/members/${moderator.user.id}/roles`, moderator, {
          roleIds: [manager, dangerous],
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (
        await service.request('PATCH', `${base}/roles/${dangerous}/members`, moderator, {
          addUserIds: [friend.user.id],
        })
      ).statusCode,
    ).toBe(403);
    const harmless = await create(server, 'Readers');
    expect(
      (
        await service.request('PATCH', `${base}/roles/${harmless}/members`, moderator, {
          addUserIds: [owner.user.id],
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (await service.request('PATCH', `${base}/roles/${manager}`, moderator, { description: 'My own rank' }))
        .statusCode,
    ).toBe(403);
    expect((await upload(server, manager, png(64), moderator)).statusCode).toBe(403);
    expect(
      (
        await service.request('PATCH', `${base}/roles/${harmless}/members`, moderator, {
          addUserIds: [friend.user.id],
        })
      ).statusCode,
    ).toBe(200);
  });

  it('rejects stale order snapshots and preserves protected positions', async () => {
    const server = await service.serverWith('Order', owner, moderator);
    const manager = await create(server, 'Manager', Permission.ManageRoles),
      first = await create(server, 'First'),
      second = await create(server, 'Second');
    await service.request('PUT', `/api/servers/${server}/members/${moderator.user.id}/roles`, owner, {
      roleIds: [manager],
    });
    const endpoint = `/api/servers/${server}/roles`;
    expect(
      (await service.request('PUT', endpoint, moderator, { roleIds: [first, manager, second] })).statusCode,
    ).toBe(403);
    expect(
      (
        await service.request('PUT', endpoint, moderator, {
          roleIds: [manager, second, first],
          expectedOrder: [manager, first, second],
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (
        await service.request('PUT', endpoint, owner, {
          roleIds: [manager, first, second],
          expectedOrder: [manager, first, second],
        })
      ).statusCode,
    ).toBe(409);
    const ordered = (await service.detail(owner, server)).roles!;
    expect(ordered.map((entry) => entry.id)).toEqual([manager, second, first, expect.any(String)]);
    expect(ordered.map((entry) => entry.position)).toEqual([3, 2, 1, 0]);
  });
});
