import { _electron as electron, expect, test } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createServer as createViteServer } from 'vite';
import { createServer } from '../../server/app';
import type { RoomOccupancy } from '../../server/presence-service';
import { voiceRoomName } from '../../server/voice-access-service';
import { TestDatabase } from '../helpers/database';
import type { AccountSession, Community, CommunityDetail } from '../../src/shared/community';

// Resting the pointer on a server in the rail shows who is talking there,
// without opening it.
test('hovering a server shows who is in its voice channels', async () => {
  test.setTimeout(120_000);
  const dataDir = await mkdtemp(path.join(os.tmpdir(), 'pulse-server-presence-'));
  let rooms: RoomOccupancy[] = [];
  const backend = await createServer(
    {
      PORT: 0,
      HOST: '127.0.0.1',
      LIVEKIT_URL: 'wss://example.invalid',
      LIVEKIT_API_KEY: 'test',
      LIVEKIT_API_SECRET: 'test',
    },
    { read: async () => rooms },
    new TestDatabase(),
  );
  await backend.listen({ port: 0, host: '127.0.0.1' });
  const api = `http://127.0.0.1:${(backend.server.address() as { port: number }).port}`;
  const password = 'Testing server presence!';
  const owner = (await (
    await fetch(`${api}/api/auth/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'owner', displayName: 'Owner', password }),
    })
  ).json()) as AccountSession;
  const headers = { 'content-type': 'application/json', authorization: `Bearer ${owner.token}` };
  const created: Community[] = [];
  for (const name of ['Alpha', 'Beta'])
    created.push(
      (await (
        await fetch(`${api}/api/servers`, { method: 'POST', headers, body: JSON.stringify({ name }) })
      ).json()) as Community,
    );
  const beta = (await (
    await fetch(`${api}/api/servers/${created[1].id}`, { headers })
  ).json()) as CommunityDetail;
  const voice = beta.channels.find((channel) => channel.type === 'voice')!;
  const startedAt = Date.now() - 125_000;
  rooms = [
    {
      roomId: voiceRoomName(voice.id),
      occupants: [
        { identity: `${owner.user.id}:desk`, name: 'Owner', joinedAt: startedAt },
        // A second window of the same person is still one person.
        { identity: `${owner.user.id}:laptop`, name: 'Owner', joinedAt: startedAt + 1_000 },
        { identity: 'friend:phone', name: 'Mika Tanaka', joinedAt: startedAt + 30_000 },
      ],
    },
  ];

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
    const rail = window.getByRole('navigation', { name: 'Servers' });
    await expect(window.getByRole('button', { name: 'Server settings and members' })).toBeVisible();

    await rail.getByRole('button', { name: 'Beta', exact: true }).hover();
    const card = window.locator('.server-peek', { hasText: 'Beta' });
    await expect(card).toBeVisible();
    await expect(card).toContainText('02 in voice');
    await expect(card).toContainText(voice.name);
    await expect(card.locator('.server-peek-person > span:last-child')).toHaveText(['Owner', 'Mika Tanaka']);
    await expect(card.locator('.server-peek-timer')).toHaveText(/^2:\d\d$/);
    // Settled after transitions.dev's 250ms entrance, and still there.
    await window.waitForTimeout(450);
    await expect(card).toHaveCSS('opacity', '1');
    if (process.env.PULSE_PEEK_SHOT) await window.screenshot({ path: process.env.PULSE_PEEK_SHOT });

    // It is only a glance: the pointer reaches what lies under it, and
    // choosing the server puts it away.
    const covered = await card.boundingBox();
    expect(
      await window.evaluate(({ x, y }) => Boolean(document.elementFromPoint(x, y)?.closest('.server-peek')), {
        x: covered!.x + covered!.width / 2,
        y: covered!.y + covered!.height / 2,
      }),
    ).toBe(false);
    await rail.getByRole('button', { name: 'Beta', exact: true }).click();
    await expect(card).toBeHidden();
    await expect(window.getByRole('button', { name: 'Server settings and members' })).toContainText('Beta');

    // Focus handed over by code, as a closing dialog does, is not a request
    // to look: only the keyboard opens it that way.
    await rail.getByRole('button', { name: 'Alpha', exact: true }).evaluate((button) => {
      (button as HTMLElement).focus();
    });
    await window.waitForTimeout(500);
    await expect(window.locator('.server-peek')).toHaveCount(0);

    // Another server answers for itself.
    await window.mouse.move(900, 500);
    await rail.getByRole('button', { name: 'Alpha', exact: true }).hover();
    const quiet = window.locator('.server-peek', { hasText: 'Alpha' });
    await expect(quiet).toContainText('Nobody in voice');
    expect(problems).toEqual([]);
  } finally {
    await application.close();
    await vite.close();
    await backend.close();
    await rm(dataDir, { recursive: true, force: true });
  }
});
