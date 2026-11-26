import { _electron as electron, expect, test } from '@playwright/test';
import { reachLiveControl } from '../helpers/live-controls';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createServer as createViteServer } from 'vite';
import { createServer } from '../../server/app';
import { TestDatabase } from '../helpers/database';
import type { AccountSession } from '../../src/shared/community';

/** With a text channel open the call sits above the conversation, smaller, and still whole. */
test('a live above the conversation keeps its frame and its volume', async () => {
  test.setTimeout(120_000);
  const dataDir = await mkdtemp(path.join(os.tmpdir(), 'pulse-live-chat-'));
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
    {
      listRooms: async () => [],
      listParticipants: async () => [],
      removeParticipant: async () => {},
      updateParticipant: async () => {},
    },
  );
  await backend.listen({ port: 0, host: '127.0.0.1' });
  const apiUrl = `http://127.0.0.1:${(backend.server.address() as { port: number }).port}`;
  const password = 'Testing full screen lives!';
  const owner = (
    await backend.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { username: 'owner', displayName: 'Owner', password },
    })
  ).json() as AccountSession;
  await backend.inject({
    method: 'POST',
    url: '/api/servers',
    headers: { authorization: `Bearer ${owner.token}` },
    payload: { name: 'Screens' },
  });
  // The test voice transport: the demo room, with one guest sharing a moving screen.
  const vite = await createViteServer({
    configFile: path.resolve('vite.config.mts'),
    cacheDir: path.join(dataDir, 'vite-cache'),
    server: { host: '127.0.0.1', port: 0 },
    define: { 'import.meta.env.VITE_API_URL': JSON.stringify(apiUrl) },
    plugins: [
      {
        name: 'fullscreen-test-voice-transport',
        enforce: 'pre',
        load(id) {
          if (!id.replaceAll('\\', '/').endsWith('/conference-gateway-factory.ts')) return;
          return `
          import { DemoConferenceGateway } from './demo-conference-gateway';
          class ScreenGateway extends DemoConferenceGateway {
            async join(command) {
              await super.join(command);
              const canvas = document.createElement('canvas');
              canvas.width = 1280;
              canvas.height = 720;
              const context = canvas.getContext('2d');
              let frame = 0;
              setInterval(() => {
                frame += 1;
                context.fillStyle = '#1d3b3f';
                context.fillRect(0, 0, 1280, 720);
                context.fillStyle = '#e8eef0';
                context.fillRect((frame * 9) % 1180, 310, 100, 100);
              }, 50);
              const stream = canvas.captureStream(20);
              this.update({
                participants: this.getSnapshot().participants.map((person, index) =>
                  index === 0
                    ? { ...person, id: ${JSON.stringify(owner.user.id)}, name: 'Owner' }
                    : index === 1
                      ? { ...person, isBroadcasting: true, screenStream: stream }
                      : person,
                ),
              });
            }
          }
          export class ConferenceGatewayFactory { static create() { return new ScreenGateway(); } }
        `;
        },
      },
    ],
  });
  await vite.listen();
  const application = await electron.launch({
    args: [path.resolve('.'), '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'],
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
    await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(1440, 900));
    await window.getByLabel('Username', { exact: true }).fill('owner');
    await window.getByLabel('Password', { exact: true }).fill(password);
    await window.getByRole('button', { name: 'Sign in', exact: true }).click();
    await window.getByRole('button', { name: 'Lounge', exact: true }).click();
    await window.getByRole('button', { name: /^general/ }).first().click();
    await expect(window.locator('.voice-surface-compact')).toBeVisible();

    // Before watching: the screen is a whole frame, its picture filling it.
    const card = window.locator('.voice-surface-compact .broadcast-card').first();
    await expect(card).toBeVisible();
    await expect
      .poll(() =>
        card.evaluate((element) => {
          const frame = element.getBoundingClientRect();
          const picture = element.querySelector('.broadcast-preview')!.getBoundingClientRect();
          return Math.abs(frame.height - picture.height) < 1 && Math.abs(frame.width / frame.height - 16 / 9) < 0.02;
        }),
      )
      .toBe(true);
    await window.screenshot({ path: 'test-results/live-chat-card.png' });

    // Watching: the volume stays in reach.
    await window.getByRole('button', { name: /^Watch/ }).first().click();
    const stage = window.locator('.voice-surface-compact .stage-live');
    await expect(stage).toBeVisible();
    const volume = await reachLiveControl(window, window.getByRole('slider', { name: /screen volume/ }));
    await expect(volume).toBeVisible();
    await volume.fill('120');
    await expect(stage.locator('.live-volume')).toContainText('120%');
    await window.screenshot({ path: 'test-results/live-chat-player.png' });
    expect(problems).toEqual([]);
  } finally {
    await application.close();
    await vite.close();
    await backend.close();
    await rm(dataDir, { recursive: true, force: true }).catch(() => undefined);
  }
});
