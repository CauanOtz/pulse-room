import { _electron as electron, expect, test } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createServer as createViteServer } from 'vite';
import { createServer } from '../../server/app';
import { TestDatabase } from '../helpers/database';
import type { AccountSession, CommunityDetail } from '../../src/shared/community';

test('mentions are written with @, light up, leave badges and follow the server setting', async () => {
  test.setTimeout(180_000);
  const dataDir = await mkdtemp(path.join(os.tmpdir(), 'pulse-notify-e2e-'));
  const backend = await createServer(
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
  await backend.listen({ port: 0, host: '127.0.0.1' });
  const api = `http://127.0.0.1:${(backend.server.address() as { port: number }).port}`;
  const password = 'Testing notifications!';
  const request = async (route: string, token?: string, body?: unknown, method = body ? 'POST' : 'GET') => {
    const response = await fetch(`${api}${route}`, {
      method,
      headers: {
        ...(body ? { 'content-type': 'application/json' } : {}),
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    return response.json();
  };
  const register = (username: string, displayName: string) =>
    request('/api/auth/register', undefined, { username, displayName, password }) as Promise<AccountSession>;
  const owner = await register('owner', 'Owner');
  const friend = await register('ana', 'Ana Clara');
  await register('leo', 'Leo');
  const server = await request('/api/servers', owner.token, { name: 'Studio' });
  const invite = await request(`/api/servers/${server.id}/invites`, owner.token, { maxUses: 3, hours: 1 });
  await request('/api/invites/join', friend.token, { code: invite.code });
  const { id: memesId } = await request(`/api/servers/${server.id}/channels`, owner.token, {
    name: 'memes',
    type: 'text',
  });
  const detail = (await request(`/api/servers/${server.id}`, owner.token)) as CommunityDetail;
  const general = detail.channels.find((channel) => channel.type === 'text' && channel.id !== memesId)!;

  const vite = await createViteServer({
    configFile: path.resolve('vite.config.mts'),
    cacheDir: path.join(dataDir, 'vite-cache'),
    server: { host: '127.0.0.1', port: 0 },
    define: { 'import.meta.env.VITE_API_URL': JSON.stringify(api) },
  });
  await vite.listen();
  const application = await electron.launch({
    args: [path.resolve('.')],
    env: {
      ...process.env,
      NODE_ENV: 'test',
      PULSE_TEST_USER_DATA: path.join(dataDir, 'profile'),
      VITE_DEV_SERVER_URL: `http://127.0.0.1:${(vite.httpServer!.address() as { port: number }).port}`,
    },
  });
  try {
    const window = await application.firstWindow();
    const errors: string[] = [];
    window.on('pageerror', (error) => errors.push(error.message));
    await application.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].setContentSize(1440, 900),
    );
    await window.getByLabel('Username', { exact: true }).fill('owner');
    await window.getByLabel('Password', { exact: true }).fill(password);
    await window.getByRole('button', { name: 'Sign in', exact: true }).click();
    await window.getByRole('button', { name: general.name, exact: true }).click();
    const composer = window.getByRole('textbox', { name: 'Message', exact: true });
    await expect(composer).toBeVisible({ timeout: 15_000 });

    // A mention elsewhere leaves a badge on its channel, once the window is listening.
    const memes = window.getByRole('button', { name: /^memes/ });
    await expect(async () => {
      await request(`/api/channels/${memesId}/messages`, friend.token, {
        content: `<@${owner.user.id}> you have to see this`,
      });
      await expect(memes).toHaveAccessibleName(/memes, \d+ mentions/, { timeout: 2_000 });
    }).toPass({ timeout: 30_000 });
    await expect(window.getByRole('button', { name: /^Studio, \d+ mentions/ })).toBeVisible();
    await window.waitForTimeout(500);
    await window.screenshot({ path: 'test-results/notifications-badges.png' });

    // A click on the notification opens its channel, which clears the badge.
    await application.evaluate(
      ({ BrowserWindow }, tag) =>
        BrowserWindow.getAllWindows()[0].webContents.send('notifications:open', tag),
      `channel:${server.id}:${memesId}`,
    );
    await expect(window.getByPlaceholder('Message #memes')).toBeVisible();
    await expect(memes).toHaveAccessibleName('memes');
    const named = window.locator('.chat-message.is-mentioning-me').first();
    await expect(named.locator('.mention.is-self')).toHaveText('@Owner');

    // Typing @ offers the people of the server; Enter names one.
    await composer.click();
    await composer.pressSequentially('nice one @an');
    const options = window.getByRole('listbox', { name: 'People to mention' });
    await expect(options.getByRole('option')).toHaveCount(1);
    await expect(options).toContainText('Ana Clara');
    await window.waitForTimeout(350);
    await window.screenshot({ path: 'test-results/notifications-suggestions.png' });
    await composer.press('Enter');
    await expect(composer).toHaveValue('nice one @ana ');
    await composer.press('Enter');
    const mine = window.locator('.chat-message', { hasText: 'nice one' });
    await expect(mine.locator('.mention')).toHaveText('@Ana Clara');
    await window.waitForTimeout(400);
    await window.screenshot({ path: 'test-results/notifications-mention.png' });

    // The bell sets how much this server may say.
    await window.getByRole('button', { name: 'Notification settings' }).click();
    const menu = window.getByRole('radiogroup', { name: 'Notify me about Studio' });
    await expect(menu.getByRole('radio', { name: /Only @mentions/ })).toHaveAttribute('aria-checked', 'true');
    await window.waitForTimeout(400);
    await window.screenshot({ path: 'test-results/notifications-menu.png' });
    await menu.getByRole('radio', { name: /Nothing/ }).click();
    await expect(menu.getByRole('radio', { name: /Nothing/ })).toHaveAttribute('aria-checked', 'true');
    await window.keyboard.press('Escape');

    // Silenced, a mention leaves no badge.
    await window.getByRole('button', { name: general.name, exact: true }).click();
    await request(`/api/channels/${memesId}/messages`, friend.token, {
      content: `<@${owner.user.id}> again`,
    });
    await window.waitForTimeout(1_500);
    await expect(memes).toHaveAccessibleName('memes');
    expect(errors).toEqual([]);
  } finally {
    await application.close();
    await vite.close();
    await backend.close();
    await rm(dataDir, { recursive: true, force: true }).catch(() => undefined);
  }
});
