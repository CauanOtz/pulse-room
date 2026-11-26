import { _electron as electron, expect, test } from '@playwright/test';
import { reachLiveControl } from '../helpers/live-controls';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createServer as createViteServer } from 'vite';
import { createServer } from '../../server/app';
import { TestDatabase } from '../helpers/database';
import type { AccountSession } from '../../src/shared/community';

/** Full screen is the picture alone, edge to edge, with its bars floating over it. */
test('a live in full screen fills the screen and keeps its controls reachable', async () => {
  test.setTimeout(120_000);
  const dataDir = await mkdtemp(path.join(os.tmpdir(), 'pulse-live-fullscreen-'));
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
    await window.getByRole('button', { name: /^Watch/ }).first().click();
    const stage = window.locator('.stage-live');
    await expect(stage).toBeVisible();

    await (await reachLiveControl(window, window.getByRole('button', { name: 'Enter full screen', exact: true }))).click();
    await expect(stage).toHaveClass(/is-fullscreen/);
    expect(await window.evaluate(() => document.fullscreenElement?.classList.contains('stage-live'))).toBe(true);
    // The window itself is full screen, and the stage and the picture cover all of it.
    await expect
      .poll(() => application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isFullScreen()))
      .toBe(true);
    const fills = (selector: string) =>
      window.evaluate((query) => {
        const box = document.querySelector(query)!.getBoundingClientRect();
        return (
          Math.abs(box.left) < 1 &&
          Math.abs(box.top) < 1 &&
          Math.abs(box.width - innerWidth) < 1 &&
          Math.abs(box.height - innerHeight) < 1
        );
      }, selector);
    await expect.poll(() => fills('.stage-live')).toBe(true);
    await expect.poll(() => fills('.stage-live .live-surface')).toBe(true);

    // A tooltip still shows over a full screen live.
    // The bars may already have stepped aside, so the pointer wakes them first.
    await (await reachLiveControl(window, window.getByRole('button', { name: 'Exit full screen', exact: true }))).hover();
    await expect(window.getByRole('tooltip').first()).toBeVisible();
    await window.screenshot({ path: 'test-results/live-fullscreen-controls.png' });

    // Left alone, the bars step aside and the picture is all there is.
    await window.mouse.move(720, 450);
    await expect(window.locator('.stage-live .live-toolbar')).toHaveClass(/is-hidden/, { timeout: 6_000 });
    await expect(window.locator('.stage-live .live-player-footer')).toHaveClass(/is-hidden/);
    await expect(window.locator('.pulse-tooltip')).toHaveCount(0).catch(async () =>
      expect(window.locator('.pulse-tooltip').first()).toHaveCSS('opacity', '0'),
    );
    // Edge to edge: no frame is left around the picture.
    expect(
      await window.locator('.stage-live').evaluate((element) => {
        const style = getComputedStyle(element);
        return [style.borderTopWidth, style.borderTopLeftRadius, style.boxShadow];
      }),
    ).toEqual(['0px', '0px', 'none']);
    await window.screenshot({ path: 'test-results/live-fullscreen-idle.png' });

    // Escape is handled by the window outside the page, out of reach of a
    // synthetic key, so the way back is the button.
    await (await reachLiveControl(window, window.getByRole('button', { name: 'Exit full screen', exact: true }))).click();
    await expect(stage).not.toHaveClass(/is-fullscreen/);
    await expect
      .poll(() => application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isFullScreen()))
      .toBe(false);
    expect(problems).toEqual([]);
  } finally {
    await application.close();
    await vite.close();
    await backend.close();
    await rm(dataDir, { recursive: true, force: true }).catch(() => undefined);
  }
});
