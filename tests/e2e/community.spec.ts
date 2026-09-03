import { _electron as electron, expect, test, type Page } from '@playwright/test';
import path from 'node:path';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import { createServer as createViteServer } from 'vite';
import { createServer } from '../../server/app';
import { TestDatabase } from '../helpers/database';
import type { AccountSession } from '../../src/shared/community';

async function expectContainedDialog(window: Page) {
  const dialog = window.locator('dialog[open]');
  await expect(dialog).toBeVisible();
  const layout = await dialog.evaluate((element) => {
    const body = element.querySelector('.modal-body')!;
    const bounds = element.getBoundingClientRect();
    return {
      fits: bounds.left >= 0 && bounds.top >= 0 && bounds.right <= innerWidth && bounds.bottom <= innerHeight,
      bodyFits: body.scrollWidth <= body.clientWidth + 1,
      pageFits: document.documentElement.scrollWidth <= innerWidth,
    };
  });
  expect(layout).toEqual({ fits: true, bodyFits: true, pageFits: true });
}

test('accounts, two private servers, invitations, chat, permissions and persistent login', async () => {
  test.setTimeout(120_000);
  const dataDir = await mkdtemp(path.join(os.tmpdir(), 'pulse-community-e2e-'));
  const database = new TestDatabase();
  const backend = await createServer(
    {
      PORT: 0,
      HOST: '127.0.0.1',
      LIVEKIT_URL: 'wss://example.invalid',
      LIVEKIT_API_KEY: 'test',
      LIVEKIT_API_SECRET: 'test',
    },
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
  const address = backend.server.address() as { port: number };
  const vite = await createViteServer({
    configFile: path.resolve('vite.config.mts'),
    server: { host: '127.0.0.1', port: 0 },
    define: { 'import.meta.env.VITE_API_URL': JSON.stringify(`http://127.0.0.1:${address.port}`) },
  });
  await vite.listen();
  const frontendAddress = vite.httpServer!.address() as { port: number };
  const env = {
    ...process.env,
    NODE_ENV: 'test',
    PULSE_TEST_USER_DATA: dataDir,
    VITE_DEV_SERVER_URL: `http://127.0.0.1:${frontendAddress.port}`,
  };
  let application = await electron.launch({ args: [path.resolve('.')], env });
  try {
    let window = await application.firstWindow();
    await expect(window.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
    await window.screenshot({ path: 'test-results/community-login.png' });
    await window.getByRole('button', { name: 'Create an account', exact: true }).click();
    await window.getByLabel('Username', { exact: true }).fill('owner');
    await window.getByLabel('Display name', { exact: true }).fill('Owner');
    await window.getByLabel('Password', { exact: true }).fill('Testing private communities!');
    await window.getByRole('button', { name: 'Create account', exact: true }).click();
    await expect(window.getByRole('dialog', { name: 'Save your recovery code' })).toBeVisible();
    await window.getByRole('button', { name: 'I saved my recovery code' }).click();
    await window.getByRole('button', { name: 'Create or join a server' }).click();
    await expectContainedDialog(window);
    await window.screenshot({ path: 'test-results/community-create-server.png' });
    await window.getByLabel('Server name', { exact: true }).fill('Just us');
    await window.getByRole('button', { name: 'Create server', exact: true }).click();
    await expect(window.getByRole('button', { name: 'Server settings and members' })).toContainText(
      'Just us',
    );
    await window.getByLabel('Message', { exact: true }).fill('Only our little circle.');
    await window.getByRole('button', { name: 'Send', exact: true }).click();
    await expect(window.getByText('Only our little circle.', { exact: true })).toBeVisible();
    await window.getByRole('button', { name: 'Add server' }).click();
    await window.getByLabel('Server name', { exact: true }).fill('Friends');
    await window.getByRole('button', { name: 'Create server', exact: true }).click();
    await expect(window.getByRole('button', { name: 'Server settings and members' })).toContainText(
      'Friends',
    );
    await expect(window.getByText('Only our little circle.', { exact: true })).toHaveCount(0);
    await window.getByRole('button', { name: 'Server settings and members' }).click();
    await window.getByRole('button', { name: 'Channels', exact: true }).click();
    await window.getByRole('button', { name: 'Create channel', exact: true }).click();
    await window.getByLabel('Channel name', { exact: true }).fill('Game room');
    await window.getByLabel('Private channel', { exact: true }).check();
    await window.getByLabel('Share screen and system audio').uncheck();
    await expectContainedDialog(window);
    await window.screenshot({ path: 'test-results/community-channel-permissions.png' });
    await window.getByRole('button', { name: 'Save channel' }).click();
    await expect(window.getByRole('dialog', { name: 'Friends', exact: true })).toBeVisible();
    await window.getByRole('button', { name: 'Invites', exact: true }).click();
    await window.getByRole('button', { name: 'Generate invite' }).click();
    const invite = await window.getByLabel('Invite code — copy and share').inputValue();
    expect(invite).toHaveLength(43);
    await expectContainedDialog(window);
    await window.screenshot({ path: 'test-results/community-invite.png' });
    const friendResponse = await backend.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { username: 'friend', displayName: 'Friend', password: 'Testing private communities!' },
    });
    const friend = friendResponse.json() as AccountSession;
    expect(
      (
        await backend.inject({
          method: 'POST',
          url: '/api/invites/join',
          headers: { authorization: `Bearer ${friend.token}` },
          payload: { code: invite },
        })
      ).statusCode,
    ).toBe(200);
    const friendServers = (
      await backend.inject({
        method: 'GET',
        url: '/api/servers',
        headers: { authorization: `Bearer ${friend.token}` },
      })
    ).json().servers;
    expect(friendServers.map((s: { name: string }) => s.name)).toEqual(['Friends']);
    await window.getByRole('button', { name: 'Close dialog' }).click();
    await window.getByRole('button', { name: 'Just us', exact: true }).click();
    await expect(window.getByText('Only our little circle.', { exact: true })).toBeVisible();
    await window.screenshot({ path: 'test-results/community-chat.png' });
    await application.close();
    application = await electron.launch({ args: [path.resolve('.')], env });
    window = await application.firstWindow();
    await expect(window.getByRole('button', { name: 'Just us', exact: true })).toBeVisible();
    await expect(window.getByRole('heading', { name: 'Welcome back' })).toHaveCount(0);
    await window.getByRole('button', { name: 'Your account' }).click();
    await expectContainedDialog(window);
    await expect(window.getByRole('heading', { name: 'Password & security' })).toBeVisible();
    const changeButton = window.getByRole('button', { name: 'Change password', exact: true });
    await expect(changeButton).toHaveCSS('background-color', 'rgb(154, 171, 255)');
    const changeBounds = await changeButton.boundingBox();
    const signOutBounds = await window.getByRole('button', { name: 'Sign out', exact: true }).boundingBox();
    expect(signOutBounds!.y - (changeBounds!.y + changeBounds!.height)).toBeGreaterThanOrEqual(20);
    await window.screenshot({ path: 'test-results/community-account.png' });
    await application.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].setContentSize(1080, 680),
    );
    await expectContainedDialog(window);
    await window.screenshot({ path: 'test-results/community-account-compact.png' });
    await window.keyboard.press('Escape');
    await expect(window.getByRole('button', { name: 'Your account' })).toBeFocused();
    await window.getByRole('button', { name: 'Server settings and members' }).click();
    await window.getByRole('button', { name: 'Settings', exact: true }).click();
    const longServerName = 'Our private room for games and conversations with friends';
    await window.getByLabel('Server name', { exact: true }).fill(longServerName);
    await window.getByRole('button', { name: 'Rename server', exact: true }).click();
    await expect(window.getByRole('dialog', { name: longServerName, exact: true })).toBeVisible();
    await expectContainedDialog(window);
    await window.getByRole('button', { name: 'Close dialog' }).click();
    expect(
      await window.locator('.server-heading > span').evaluate((element) => {
        return (
          element.scrollWidth > element.clientWidth && getComputedStyle(element).textOverflow === 'ellipsis'
        );
      }),
    ).toBe(true);
    expect(
      await window.locator('.app-shell').evaluate((element) => element.scrollWidth <= element.clientWidth),
    ).toBe(true);
    await window.screenshot({ path: 'test-results/community-long-name.png' });
    await window.getByRole('button', { name: 'Your account' }).click();
    await window.getByLabel('Current password', { exact: true }).fill('Testing private communities!');
    await window.getByLabel('New password', { exact: true }).fill('A different secure password!');
    await changeButton.click();
    await expect(window.getByRole('status')).toContainText('Password changed.');
    await window.getByRole('button', { name: 'Sign out', exact: true }).click();
    await expect(window.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
    await window.getByLabel('Username', { exact: true }).fill('friend');
    await window.getByLabel('Password', { exact: true }).fill('Testing private communities!');
    await window.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(window.getByRole('button', { name: 'Friends', exact: true })).toBeVisible();
    await expect(window.getByRole('button', { name: longServerName, exact: true })).toHaveCount(0);
    await expect(window.getByRole('button', { name: 'Game room', exact: true })).toHaveCount(0);
    await window.getByRole('button', { name: 'Server settings and members' }).click();
    await expect(window.getByRole('button', { name: 'Invites', exact: true })).toHaveCount(0);
    await expect(window.getByRole('button', { name: 'Channels', exact: true })).toHaveCount(0);
  } finally {
    await application.close();
    await vite.close();
    await backend.close();
    await rm(dataDir, { recursive: true, force: true });
  }
});
