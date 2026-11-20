import { _electron as electron, expect, test } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createServer as createViteServer } from 'vite';
import { createServer } from '../../server/app';
import { TestDatabase } from '../helpers/database';
import type { AccountSession } from '../../src/shared/community';

// Creating, deleting and switching servers must never take the room down: it
// is what holds a call, and a call in one server outlives the others.
test('creating and deleting servers keeps the room open and switches in one click', async () => {
  test.setTimeout(120_000);
  const dataDir = await mkdtemp(path.join(os.tmpdir(), 'pulse-server-switch-'));
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
  const password = 'Testing server switching!';
  const owner = (await (
    await fetch(`${api}/api/auth/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'owner', displayName: 'Owner', password }),
    })
  ).json()) as AccountSession;
  for (const name of ['Alpha', 'Beta'])
    await fetch(`${api}/api/servers`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${owner.token}` },
      body: JSON.stringify({ name }),
    });
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
    const problems: string[] = [];
    window.on('pageerror', (error) => problems.push(error.message));
    await window.getByLabel('Username', { exact: true }).fill('owner');
    await window.getByLabel('Password', { exact: true }).fill(password);
    await window.getByRole('button', { name: 'Sign in', exact: true }).click();
    const heading = window.getByRole('button', { name: 'Server settings and members' });
    const rail = window.getByRole('navigation', { name: 'Servers' });
    await expect(heading).toContainText('Alpha');
    // The room's own element, remembered: if it is ever replaced, the room was
    // taken down and built again, which is what ends a call.
    await window.evaluate(() => {
      (window as unknown as { shell?: Element | null }).shell = document.querySelector('.app-shell');
    });
    const sameRoom = () =>
      window.evaluate(
        () =>
          Boolean(document.querySelector('.app-shell')) &&
          document.querySelector('.app-shell') === (window as unknown as { shell?: Element | null }).shell,
      );

    await rail.getByRole('button', { name: 'Add server', exact: true }).click();
    const adding = window.getByRole('dialog', { name: 'Create a server', exact: true });
    await adding.getByLabel('Server name').fill('Doomed');
    await adding.getByRole('button', { name: 'Create server', exact: true }).click();
    await expect(heading).toContainText('Doomed');
    await expect(rail.getByRole('button', { name: 'Doomed', exact: true })).toHaveAttribute('aria-current', 'true');
    expect(await sameRoom()).toBe(true);

    await heading.click();
    await window.getByRole('button', { name: 'Delete server', exact: true }).click();
    await window
      .getByRole('dialog', { name: 'Delete server', exact: true })
      .getByRole('button', { name: 'Delete', exact: true })
      .click();
    // Straight to the next server, with no empty screen in between.
    await expect(heading).toContainText('Alpha');
    await expect(rail.getByRole('button', { name: 'Doomed', exact: true })).toHaveCount(0);
    await expect(window.locator('.community-empty')).toHaveCount(0);
    expect(await sameRoom()).toBe(true);

    // One click is enough, and the rail answers it before the room has loaded.
    for (const name of ['Beta', 'Alpha', 'Beta']) {
      await rail.getByRole('button', { name, exact: true }).click();
      await expect(rail.getByRole('button', { name, exact: true })).toHaveAttribute('aria-current', 'true');
      await expect(heading).toContainText(name);
    }
    expect(await sameRoom()).toBe(true);
    expect(problems).toEqual([]);
  } finally {
    await application.close();
    await vite.close();
    await backend.close();
    await rm(dataDir, { recursive: true, force: true }).catch(() => undefined);
  }
});
