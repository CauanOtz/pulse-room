import { _electron as electron, expect, test } from '@playwright/test';
import path from 'node:path';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import { createServer as createViteServer } from 'vite';
import { createServer } from '../../server/app';
import { TestDatabase } from '../helpers/database';
import type { AccountSession, CommunityDetail } from '../../src/shared/community';
import { Permission } from '../../src/shared/permissions';

/**
 * A server shaped the way its owner would: a role made and given, a category
 * that keeps its channels to staff, and a timeout handed out from the member
 * list. Other people act through the service directly, and what they may then
 * see and do is read back from it, so the test knows the screens asked for the
 * right thing and the service enforced it.
 */
test('roles, a staff category and moderation, end to end', async () => {
  test.setTimeout(180_000);
  const dataDir = await mkdtemp(path.join(os.tmpdir(), 'pulse-roles-e2e-'));
  const database = new TestDatabase();
  const backend = await createServer(
    { PORT: 0, HOST: '127.0.0.1', LIVEKIT_URL: 'wss://example.invalid', LIVEKIT_API_KEY: 'test', LIVEKIT_API_SECRET: 'test' },
    { read: async () => [] },
    database,
    {
      listRooms: async () => [],
      listParticipants: async () => [],
      removeParticipant: async () => {},
      updateParticipant: async () => {},
    },
  );
  await backend.listen({ port: 0, host: '127.0.0.1' });
  const api = `http://127.0.0.1:${(backend.server.address() as { port: number }).port}`;
  const vite = await createViteServer({
    configFile: path.resolve('vite.config.mts'),
    server: { host: '127.0.0.1', port: 0 },
    define: { 'import.meta.env.VITE_API_URL': JSON.stringify(api) },
  });
  await vite.listen();
  const frontend = `http://127.0.0.1:${(vite.httpServer!.address() as { port: number }).port}`;

  const password = 'Testing roles end to end!';
  const call = async (method: string, url: string, token: string, body?: unknown) =>
    fetch(`${api}${url}`, {
      method,
      headers: { authorization: `Bearer ${token}`, ...(body ? { 'content-type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
  const register = async (username: string, displayName: string) =>
    (await (
      await fetch(`${api}/api/auth/register`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ username, displayName, password }),
      })
    ).json()) as AccountSession;

  const application = await electron.launch({
    args: [path.resolve('.')],
    env: { ...process.env, NODE_ENV: 'test', PULSE_TEST_USER_DATA: dataDir, VITE_DEV_SERVER_URL: frontend },
  });
  try {
    const window = await application.firstWindow();
    await expect(window.getByRole('heading', { name: 'Welcome back' })).toBeVisible({ timeout: 60_000 });
    await window.getByRole('button', { name: 'Create an account', exact: true }).click();
    await window.getByLabel('Username', { exact: true }).fill('owner');
    await window.getByLabel('Display name', { exact: true }).fill('Owner');
    await window.getByLabel('Password', { exact: true }).fill(password);
    await window.getByRole('button', { name: 'Create account', exact: true }).click();
    await window.getByRole('button', { name: 'I saved my recovery code' }).click();
    await window.getByRole('button', { name: 'Create or join a server' }).click();
    await window.getByLabel('Server name', { exact: true }).fill('Pulse');
    await window.getByRole('button', { name: 'Create server', exact: true }).click();
    await expect(window.getByRole('button', { name: 'Server settings and members' })).toContainText('Pulse');

    const owner = (await (
      await fetch(`${api}/api/auth/login`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ username: 'owner', password }),
      })
    ).json()) as AccountSession;
    const serverId = ((await (await call('GET', '/api/servers', owner.token)).json()) as { servers: { id: string }[] })
      .servers[0].id;
    const { code } = (await (
      await call('POST', `/api/servers/${serverId}/invites`, owner.token, { maxUses: 5, hours: 1 })
    ).json()) as { code: string };
    const friend = await register('friend', 'Friend');
    const guest = await register('guest', 'Guest');
    for (const person of [friend, guest])
      expect((await call('POST', '/api/invites/join', person.token, { code })).status).toBe(200);
    const detailAs = async (session: AccountSession) =>
      (await (await call('GET', `/api/servers/${serverId}`, session.token)).json()) as CommunityDetail;

    // ------------------------------------------------ a role, made and given
    await window.getByRole('button', { name: 'Server settings and members' }).click();
    const settings = window.getByRole('dialog', { name: 'Pulse' });
    await settings.getByRole('button', { name: 'Roles', exact: true }).click();
    await settings.getByRole('button', { name: /Create role/ }).click();
    await expect(settings.getByLabel('Role name')).toHaveValue('New role');
    await settings.getByLabel('Role name').fill('Moderator');
    await settings.getByRole('button', { name: 'Role colour: #6a5acd' }).click();
    await settings.getByLabel('Display separately').check();
    await settings.getByRole('tab', { name: 'Permissions' }).click();
    await settings.getByLabel('Kick members').check();
    await settings.getByLabel('Manage messages').check();
    await settings.getByLabel('Timeout members').check();
    // Administrator sits apart, in red, with what it means spelled out.
    await expect(settings.getByText('Grants every permission and bypasses channel restrictions.')).toBeVisible();
    await settings.getByRole('button', { name: 'Save role' }).click();
    await expect(settings.getByRole('status')).toHaveText('Role saved.');
    await window.screenshot({ path: 'test-results/roles-editor.png' });

    await settings.getByRole('tab', { name: /Members/ }).click();
    await settings.getByRole('combobox', { name: 'Add a member to this role' }).click();
    await window.getByRole('option', { name: 'Friend' }).click();
    await expect(settings.getByRole('button', { name: 'Remove Friend from Moderator' })).toBeVisible();
    const moderator = (await detailAs(owner)).roles!.find((role) => role.name === 'Moderator')!;
    expect(moderator).toMatchObject({ colour: '#6a5acd', hoist: true });
    expect(moderator.permissions).toBe(Permission.KickMembers | Permission.ManageMessages | Permission.TimeoutMembers);
    expect((await detailAs(owner)).members.find((m) => m.id === friend.user.id)?.roleIds).toEqual([moderator.id]);
    await settings.getByRole('button', { name: 'Close dialog' }).click();

    // Displayed separately: the member list gathers its people under it.
    const roster = window.getByRole('complementary', { name: 'Members' });
    await expect(roster).toContainText('Moderator — 1');
    await roster.getByRole('button', { name: "View Friend's profile" }).click();
    const card = window.getByRole('dialog', { name: 'Friend profile' });
    await expect(card.getByRole('list', { name: 'Roles' })).toContainText('Moderator');
    await window.keyboard.press('Escape');

    // ------------------------------------------------ a category only staff can see
    await window.getByRole('button', { name: /Create category/ }).click();
    await window.getByLabel('Category name').fill('STAFF');
    await window.getByRole('button', { name: 'Create category', exact: true }).click();
    const staff = window.locator('.channel-category', { hasText: 'STAFF' });
    await expect(staff).toBeVisible();
    await staff.hover();
    await staff.getByRole('button', { name: 'Edit STAFF' }).click();
    const categoryEditor = window.getByRole('dialog', { name: 'Edit category' });
    await categoryEditor.getByRole('tab', { name: 'Permissions' }).click();
    await categoryEditor
      .getByRole('radiogroup', { name: 'View channels' })
      .getByRole('radio', { name: 'Deny' })
      .click();
    await categoryEditor.getByRole('button', { name: 'Add a role or member' }).click();
    await window.getByRole('menuitem', { name: 'Moderator' }).click();
    await expect(categoryEditor.getByRole('option', { name: /Moderator/ })).toHaveAttribute('aria-selected', 'true');
    await categoryEditor
      .getByRole('radiogroup', { name: 'View channels' })
      .getByRole('radio', { name: 'Allow' })
      .click();
    await window.screenshot({ path: 'test-results/roles-category-permissions.png' });
    await categoryEditor.getByRole('button', { name: 'Save category' }).click();
    await expect(categoryEditor).toHaveCount(0);

    await staff.hover();
    await staff.getByRole('button', { name: 'Create channel in STAFF' }).click();
    await window.getByLabel('Channel name', { exact: true }).fill('logs');
    await window.getByRole('button', { name: 'Save channel' }).click();
    // Listed under the category, with the lock its permissions earn it.
    await expect(staff.locator('.channel-item', { hasText: 'logs' }).getByLabel('Private')).toBeVisible();
    // Staff see it through their role; everybody else does not know it is there.
    expect((await detailAs(friend)).channels.map((channel) => channel.name)).toContain('logs');
    const asGuest = await detailAs(guest);
    expect(asGuest.channels.map((channel) => channel.name)).not.toContain('logs');
    expect(asGuest.categories).toEqual([]);

    const logs = window.locator('.channel-item', { hasText: 'logs' });
    await logs.hover();
    await logs.getByRole('button', { name: 'Edit logs' }).click();
    const channelEditor = window.getByRole('dialog', { name: 'Edit channel', exact: true });
    await channelEditor.getByRole('tab', { name: 'Permissions' }).click();
    await expect(channelEditor.getByRole('status')).toContainText('Permissions synced with STAFF');
    await window.screenshot({ path: 'test-results/roles-channel-synced.png' });
    await window.keyboard.press('Escape');

    // ------------------------------------------------ a timeout from the member list
    await window.getByRole('button', { name: 'Server settings and members' }).click();
    await settings.getByRole('button', { name: /^Members/ }).click();
    await expect(settings.locator('.member-row', { hasText: 'Friend' })).toContainText('Moderator');
    await settings.getByRole('button', { name: 'Manage Guest' }).click();
    await window.getByRole('menuitem', { name: 'Timeout' }).click();
    await window.getByRole('menuitem', { name: '5 minutes' }).click();
    await expect(settings.locator('.member-row', { hasText: 'Guest' }).getByLabel('In a timeout')).toBeVisible();
    await window.screenshot({ path: 'test-results/roles-members.png' });
    const general = asGuest.channels.find((channel) => channel.name === 'general')!;
    const refused = await call('POST', `/api/channels/${general.id}/messages`, guest.token, { content: 'hello?' });
    expect(refused.status).toBe(403);

    // The moderator's own menu reaches the guest, but not the owner above them.
    const asFriend = await detailAs(friend);
    expect(asFriend.server.permissions! & Permission.KickMembers).toBeTruthy();
    expect((await call('DELETE', `/api/servers/${serverId}/members/${owner.user.id}`, friend.token)).status).toBe(403);
    await settings.getByRole('button', { name: 'Close dialog' }).click();
  } finally {
    await application.close();
    await vite.close();
    await backend.close();
    await rm(dataDir, { recursive: true, force: true });
  }
});
