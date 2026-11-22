import { _electron as electron, expect, test } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createServer as createViteServer } from 'vite';
import { createServer } from '../../server/app';
import { TestDatabase } from '../helpers/database';
import type { AccountSession } from '../../src/shared/community';

test('invites somebody by username, who joins from the message without a code', async () => {
  test.setTimeout(120_000);
  const directories = [
    await mkdtemp(path.join(os.tmpdir(), 'pulse-direct-owner-')),
    await mkdtemp(path.join(os.tmpdir(), 'pulse-direct-guest-')),
  ];
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
  const password = 'Testing invitations by message!';
  const register = async (username: string, displayName: string) => {
    const response = await fetch(`${api}/api/auth/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username, displayName, password }),
    });
    return (await response.json()) as AccountSession;
  };
  const owner = await register('owner', 'Owner');
  await register('guest', 'Guest');
  await fetch(`${api}/api/servers`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${owner.token}` },
    body: JSON.stringify({ name: 'Late nights' }),
  });
  const vite = await createViteServer({
    configFile: path.resolve('vite.config.mts'),
    server: { host: '127.0.0.1', port: 0 },
    define: { 'import.meta.env.VITE_API_URL': JSON.stringify(api) },
  });
  await vite.listen();
  const launch = (dataDir: string) =>
    electron.launch({
      args: [path.resolve('.')],
      env: {
        ...process.env,
        NODE_ENV: 'test',
        PULSE_TEST_USER_DATA: dataDir,
        VITE_DEV_SERVER_URL: `http://127.0.0.1:${(vite.httpServer!.address() as { port: number }).port}`,
      },
    });
  let application = await launch(directories[0]);
  try {
    let window = await application.firstWindow();
    await window.getByLabel('Username', { exact: true }).fill('owner');
    await window.getByLabel('Password', { exact: true }).fill(password);
    await window.getByRole('button', { name: 'Sign in', exact: true }).click();
    // The password check alone can take seconds on a CI runner.
    await expect(window.getByRole('button', { name: 'Server settings and members' })).toContainText(
      'Late nights',
      { timeout: 15_000 },
    );
    await application.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].setContentSize(1440, 900),
    );

    // Invited by name, from the server, with a note.
    await window.getByRole('button', { name: 'Invite people', exact: true }).click();
    const dialog = window.getByRole('dialog', { name: 'Invite people to Late nights' });
    await expect(dialog).toBeVisible();
    await dialog.getByLabel('Username', { exact: true }).fill('nobody_here');
    await dialog.getByRole('button', { name: 'Send invitation' }).click();
    await expect(dialog.getByRole('alert')).toContainText('Nobody goes by that username.');
    await dialog.getByLabel('Username', { exact: true }).fill('guest');
    await dialog.getByLabel('Note', { exact: true }).fill('Come play tonight');
    await window.waitForTimeout(400);
    await window.screenshot({ path: 'test-results/direct-invite-dialog.png' });
    await dialog.getByRole('button', { name: 'Send invitation' }).click();
    await expect(dialog.getByText('Invitation sent to @guest')).toBeVisible();
    await dialog.getByRole('button', { name: /Open conversation/ }).click();

    // The sender sees the card waiting in the conversation.
    await expect(window.getByRole('complementary', { name: 'Direct messages' })).toBeVisible();
    await expect(window.locator('.direct-message-text', { hasText: 'Come play tonight' })).toBeVisible();
    await expect(window.getByText('Waiting for an answer')).toBeVisible();
    await window.getByLabel('Message', { exact: true }).fill('It is the server with the late games');
    await window.getByRole('button', { name: 'Send', exact: true }).click();
    await expect(
      window.locator('.direct-message-text', { hasText: 'It is the server with the late games' }),
    ).toBeVisible();
    await window.waitForTimeout(500);
    await window.screenshot({ path: 'test-results/direct-owner.png' });
    await application.close();

    // The guest belongs to no server yet; the message is how they find it.
    application = await launch(directories[1]);
    window = await application.firstWindow();
    await window.getByLabel('Username', { exact: true }).fill('guest');
    await window.getByLabel('Password', { exact: true }).fill(password);
    await window.getByRole('button', { name: 'Sign in', exact: true }).click();
    await application.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].setContentSize(1440, 900),
    );
    const inbox = window.getByRole('button', { name: 'Direct messages, 2 unread' });
    await expect(inbox).toBeVisible();
    await inbox.click();
    await window.getByRole('button', { name: 'Owner', exact: true }).click();
    await expect(window.getByText('Owner invited you to a server')).toBeVisible();
    // The person at the top of the conversation opens their profile.
    await window.getByRole('button', { name: "View Owner's profile" }).first().click();
    const profile = window.getByRole('dialog', { name: "Owner's profile" });
    await expect(profile).toBeVisible();
    await expect(profile.getByText('You do not share a server yet.')).toBeVisible();
    await window.waitForTimeout(900);
    await window.screenshot({ path: 'test-results/direct-profile.png' });
    await profile.getByRole('button', { name: 'Close profile' }).click();
    await expect(profile).toHaveCount(0);
    await window.waitForTimeout(600);
    await window.screenshot({ path: 'test-results/direct-guest.png' });
    await window.getByRole('button', { name: 'Join server' }).click();
    await expect(window.getByRole('button', { name: 'Server settings and members' })).toContainText(
      'Late nights',
    );
    // Reading it cleared the count.
    await expect(window.getByRole('button', { name: 'Direct messages', exact: true })).toBeVisible();
    await window.screenshot({ path: 'test-results/direct-joined.png' });
  } finally {
    await application.close();
    await vite.close();
    await backend.close();
    await Promise.all(directories.map((directory) => rm(directory, { recursive: true, force: true })));
  }
});
