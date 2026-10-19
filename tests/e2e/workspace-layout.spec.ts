import { _electron as electron, expect, test } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createServer as createViteServer } from 'vite';
import { createServer } from '../../server/app';
import { TestDatabase } from '../helpers/database';
import type { AccountSession, CommunityDetail } from '../../src/shared/community';

/** Real account/chat APIs; the test-only voice transport avoids an external LiveKit dependency. */
test('voice and chat share the workspace without losing controls on resize', async () => {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), 'pulse-layout-e2e-'));
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
  const apiUrl = `http://127.0.0.1:${(backend.server.address() as { port: number }).port}`;
  const password = 'Testing workspace layout!';
  const owner = (
    await backend.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { username: 'owner', displayName: 'Owner', password },
    })
  ).json() as AccountSession;
  const headers = { authorization: `Bearer ${owner.token}` };
  const server = (
    await backend.inject({ method: 'POST', url: '/api/servers', headers, payload: { name: 'Layout test' } })
  ).json() as { id: string };
  const invite = (
    await backend.inject({
      method: 'POST',
      url: `/api/servers/${server.id}/invites`,
      headers,
      payload: { maxUses: 3, hours: 1 },
    })
  ).json() as { code: string };
  const guests: AccountSession[] = [];
  for (const displayName of ['Friend', 'Neighbour', 'Guest']) {
    const guest = (
      await backend.inject({
        method: 'POST',
        url: '/api/auth/register',
        payload: { username: displayName.toLowerCase(), displayName, password },
      })
    ).json() as AccountSession;
    const joined = await backend.inject({
      method: 'POST',
      url: '/api/invites/join',
      headers: { authorization: `Bearer ${guest.token}` },
      payload: { code: invite.code },
    });
    expect(joined.statusCode).toBe(200);
    guests.push(guest);
  }
  const detail = (
    await backend.inject({ method: 'GET', url: `/api/servers/${server.id}`, headers })
  ).json() as CommunityDetail;
  const text = detail.channels.find((channel) => channel.type === 'text')!;
  await backend.inject({
    method: 'POST',
    url: `/api/channels/${text.id}/messages`,
    headers,
    payload: { content: 'The conversation stays open while we are in voice.' },
  });

  const vite = await createViteServer({
    configFile: path.resolve('vite.config.mts'),
    server: { host: '127.0.0.1', port: 0 },
    define: { 'import.meta.env.VITE_API_URL': JSON.stringify(apiUrl) },
    plugins: [
      {
        name: 'layout-test-voice-transport',
        enforce: 'pre',
        load(id) {
          if (!id.replaceAll('\\', '/').endsWith('/conference-gateway-factory.ts')) return;
          return `
          import { DemoConferenceGateway } from './demo-conference-gateway';
          class LayoutGateway extends DemoConferenceGateway {
            async join(command) {
              await super.join(command);
              this.update({ participants: this.getSnapshot().participants.map((person, index) => ({ ...person, id: ${JSON.stringify([owner, ...guests].map((session) => session.user.id))}[index], name: ${JSON.stringify([owner, ...guests].map((session) => session.user.displayName))}[index], initials: ${JSON.stringify([owner, ...guests].map((session) => session.user.displayName.slice(0, 2).toUpperCase()))}[index] })) });
            }
          }
          export class ConferenceGatewayFactory { static create() { return new LayoutGateway(); } }
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
      PULSE_TEST_USER_DATA: dataDir,
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
    await expect(window.getByRole('textbox', { name: 'Message' })).toBeVisible();
    await expect(window.locator('.stage-room')).toHaveCount(0);
    await window.getByRole('button', { name: 'Lounge', exact: true }).click();
    await expect(window.locator('.stage-room')).toBeVisible();
    await window.getByRole('button', { name: 'general', exact: true }).click();
    await expect(window.locator('.voice-surface-compact .stage-room')).toBeVisible();
    await expect(
      window.getByText('The conversation stays open while we are in voice.', { exact: true }),
    ).toBeVisible();
    await window.getByRole('textbox', { name: 'Message' }).fill('Sent while connected.');
    await window.getByRole('button', { name: 'Send', exact: true }).click();
    await expect(window.getByText('Sent while connected.', { exact: true })).toBeVisible();
    const controls = window.getByLabel('Call controls');
    await controls.getByRole('button', { name: 'Mute microphone', exact: true }).click();
    await expect(controls.getByRole('button', { name: 'Unmute microphone', exact: true })).toBeVisible();
    await expect(controls.getByRole('button', { name: 'Unmute microphone', exact: true })).toBeEnabled();
    await application.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].setContentSize(1572, 870),
    );
    await window.locator('.room-header').hover();
    await window.screenshot({ path: 'test-results/workspace-voice-chat.png' });
    expect(
      await window.locator('.voice-secondary .tile-face').evaluateAll((faces) => {
        const tops = faces.map((face) => face.getBoundingClientRect().top);
        return Math.max(...tops) - Math.min(...tops) < 1;
      }),
    ).toBe(true);
    expect(
      await window.evaluate(() => {
        const lead = document.querySelector('.is-featured .tile-face')!.getBoundingClientRect();
        const other = document.querySelector('.voice-secondary .tile-face')!.getBoundingClientRect();
        const room = document.querySelector('.voice-ensemble')!;
        return lead.width >= other.width * 1.7 && room.scrollHeight <= room.clientHeight + 1;
      }),
    ).toBe(true);
    await window.screenshot({ path: 'test-results/workspace-voice-chat.png' });

    for (const [width, height] of [
      [1080, 680],
      [1920, 1080],
    ]) {
      await application.evaluate(
        ({ BrowserWindow }, size) => BrowserWindow.getAllWindows()[0].setContentSize(size[0], size[1]),
        [width, height],
      );
      await expect(controls.getByRole('button', { name: 'Leave call' })).toBeVisible();
      await expect(window.getByText('Sent while connected.', { exact: true })).toBeVisible();
      expect(
        await window.evaluate(() => {
          const box = (selector: string) => document.querySelector(selector)!.getBoundingClientRect();
          const stage = box('.voice-surface-compact');
          const chat = box('.text-chat');
          const field = box('.composer-field');
          const dock = box('.call-dock');
          const members = box('.member-sidebar');
          const tiles = document.querySelector('.voice-surface-compact .tile-grid')!;
          return (
            stage.bottom <= chat.top + 1 &&
            field.bottom <= innerHeight &&
            dock.bottom <= stage.bottom &&
            field.right <= members.left &&
            tiles.scrollHeight <= tiles.clientHeight + 1 &&
            document.documentElement.scrollWidth <= innerWidth
          );
        }),
      ).toBe(true);
      await window.locator('.room-header').hover();
      await window.screenshot({ path: `test-results/workspace-${width}.png` });
    }
    await window.getByRole('button', { name: 'Hide members' }).click();
    await expect(window.getByRole('complementary', { name: 'Members' })).toHaveCount(0);

    // Browser fullscreen only paints descendants of the enlarged element.
    // Check actual clicks too: a body portal can exist but stay behind it.
    await window.getByRole('button', { name: 'Enter full screen', exact: true }).click();
    await expect(window.locator('.stage:fullscreen')).toBeVisible();
    await controls.getByRole('button', { name: 'Share full screen', exact: true }).click();
    const sourcePicker = window.getByRole('dialog', { name: 'Share your full screen', exact: true });
    await expect(window.locator('.stage:fullscreen').getByRole('dialog')).toHaveCount(1);
    await sourcePicker.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(sourcePicker).toHaveCount(0);
    await expect(window.locator('.stage:fullscreen')).toBeVisible();

    await controls.getByRole('button', { name: 'Open audio settings', exact: true }).click();
    const audioSettings = window.getByRole('dialog', { name: 'Voice and video', exact: true });
    await expect(window.locator('.stage:fullscreen').getByRole('dialog')).toHaveCount(1);
    await audioSettings.getByRole('combobox', { name: 'Microphone', exact: true }).click();
    await expect(window.locator('.stage:fullscreen').getByRole('listbox')).toBeVisible();
    await window.getByRole('option').first().click();
    await audioSettings.getByRole('button', { name: 'Close', exact: true }).click();
    await expect(audioSettings).toHaveCount(0);

    await controls.getByRole('button', { name: 'Stream options', exact: true }).click();
    const streamMenu = window.locator('.stage:fullscreen').getByRole('menu', { name: 'Stream options' });
    await streamMenu.getByRole('menuitemradio', { name: '720p · 30 fps', exact: true }).click();
    await expect(streamMenu).toHaveCount(0);

    // A quiet tile disables left-click watching; its context menu still works.
    await window.locator('.stage:fullscreen').getByRole('button', { name: 'Friend', exact: true }).click({ button: 'right', force: true });
    const participantMenu = window.locator('.stage:fullscreen').getByRole('dialog', { name: 'Friend audio', exact: true });
    await participantMenu.getByRole('button', { name: 'Profile', exact: true }).click();
    const profile = window.locator('.stage:fullscreen').getByRole('dialog', { name: "Friend's profile", exact: true });
    await profile.getByRole('button', { name: 'Close profile', exact: true }).click();

    await window.getByRole('button', { name: 'Exit full screen', exact: true }).click();
    await expect(window.locator('.stage:fullscreen')).toHaveCount(0);
    await controls.getByRole('button', { name: 'Share full screen', exact: true }).click();
    await expect(sourcePicker).toBeVisible();
    await sourcePicker.getByRole('button', { name: 'Cancel', exact: true }).click();

    await controls.getByRole('button', { name: 'Leave call' }).click();
    await expect(window.locator('.voice-surface-compact')).toHaveCount(0);
    await expect(window.getByText('Sent while connected.', { exact: true })).toBeVisible();
    expect(problems).toEqual([]);
  } finally {
    await application.close();
    await vite.close();
    await backend.close();
    await rm(dataDir, { recursive: true, force: true });
  }
});
