import { _electron as electron, expect, test } from '@playwright/test';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createServer as createViteServer } from 'vite';
import { createServer } from '../../server/app';
import { TestDatabase } from '../helpers/database';
import type { AccountSession, CommunityDetail } from '../../src/shared/community';
import { png } from '../helpers/images';

test('server identity, appearance and onboarding persist through the real APIs', async () => {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), 'pulse-settings-e2e-'));
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
  const owner = (
    await backend.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: {
        username: 'owner',
        displayName: 'Owner',
        password: 'Testing server settings!',
      },
    })
  ).json() as AccountSession;
  const headers = { authorization: `Bearer ${owner.token}` };
  const server = (
    await backend.inject({ method: 'POST', url: '/api/servers', headers, payload: { name: 'Just us' } })
  ).json() as { id: string };
  const base = `/api/servers/${server.id}`;
  const initial = (await backend.inject({ method: 'GET', url: base, headers })).json() as CommunityDetail;
  if (!process.env.PULSE_SETTINGS_BASELINE) {
    await backend.inject({
      method: 'PATCH',
      url: base,
      headers,
      payload: {
        description: 'A cozy space for friends to hang out, talk and share.',
        welcomeMessage: 'Welcome to Just us! 👋\nWe’re glad you’re here. Feel free to introduce yourself!',
        landingChannelId: initial.channels.find((channel) => channel.type === 'text')!.id,
      },
    });
  }
  const vite = await createViteServer({
    configFile: path.resolve('vite.config.mts'),
    cacheDir: path.join(dataDir, 'vite-cache'),
    server: { host: '127.0.0.1', port: 0 },
    define: {
      'import.meta.env.VITE_API_URL': JSON.stringify(
        `http://127.0.0.1:${(backend.server.address() as { port: number }).port}`,
      ),
    },
  });
  await vite.listen();
  const application = await electron.launch({
    args: [path.resolve('.')],
    env: {
      ...process.env,
      NODE_ENV: 'test',
      PULSE_TEST_USER_DATA: dataDir,
      VITE_DEV_SERVER_URL: `http://127.0.0.1:${(vite.httpServer!.address() as { port: number }).port}`,
    },
  });
  let newcomerApplication: typeof application | undefined;
  try {
    const window = await application.firstWindow();
    const problems: string[] = [];
    window.on('pageerror', (error) => problems.push(error.message));
    await application.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].setContentSize(1672, 941),
    );
    await window.getByLabel('Username', { exact: true }).fill('owner');
    await window.getByLabel('Password', { exact: true }).fill('Testing server settings!');
    await window.getByRole('button', { name: 'Sign in', exact: true }).click();
    await window.getByRole('button', { name: 'Server settings and members' }).click();
    await window.getByRole('button', { name: 'Server', exact: true }).click();
    await expect(window.getByLabel('Server name', { exact: true })).toHaveValue('Just us');
    const artifacts = process.env.PULSE_SETTINGS_ARTIFACTS ?? 'test-results';
    await mkdir(artifacts, { recursive: true });
    const cycle = process.env.PULSE_SETTINGS_CYCLE ?? 'final';
    const screenshot = path.join(artifacts, `server-settings-${cycle}.png`);
    await window.screenshot({ path: screenshot });
    await writeFile(
      path.join(artifacts, `server-settings-${cycle}-geometry.json`),
      JSON.stringify(
        await window.evaluate(() =>
          Array.from(
            document.querySelectorAll(
              '.settings-rail,.settings-heading,.server-settings-card,.server-identity-grid,.server-identity-inputs input,.server-identity-inputs textarea,.server-card-heading,.server-onboarding-grid,.server-onboarding-row',
            ),
          ).map((element) => {
            const box = element.getBoundingClientRect();
            const style = getComputedStyle(element);
            return {
              selector: element.className || element.tagName,
              x: box.x,
              y: box.y,
              width: box.width,
              height: box.height,
              fontSize: style.fontSize,
              lineHeight: style.lineHeight,
              fontWeight: style.fontWeight,
            };
          }),
        ),
        null,
        2,
      ),
    );
    if (process.env.PULSE_SETTINGS_BASELINE) return;
    if (!process.env.PULSE_SETTINGS_VISUAL_ONLY) {
      const pending = window.getByRole('region', { name: 'Unsaved server changes' });
      await expect(pending).toHaveCount(0);
      await window.getByLabel('Server name', { exact: true }).fill('Our little studio');
      await window
        .getByLabel('Description (optional)', { exact: true })
        .fill('Music, ideas and good conversations.');
      await expect(pending).toBeVisible();
      await window.getByRole('button', { name: 'Preview server', exact: true }).click();
      const preview = window.getByRole('dialog', { name: 'Server preview', exact: true });
      await expect(preview).toContainText('Unsaved preview');
      await expect(preview.getByRole('heading', { name: 'Our little studio' })).toBeVisible();
      await window.screenshot({ path: path.join(artifacts, 'server-preview-unsaved.png') });
      await preview.getByRole('button', { name: 'Close dialog', exact: true }).click();
      expect((await backend.inject({ method: 'GET', url: base, headers })).json().server.name).toBe(
        'Just us',
      );
      await window.getByRole('button', { name: /^Members/ }).click();
      const discard = window.getByRole('dialog', { name: 'Discard unsaved changes?', exact: true });
      await expect(discard).toBeVisible();
      await discard.getByRole('button', { name: 'Cancel', exact: true }).click();
      await expect(window.getByLabel('Server name', { exact: true })).toHaveValue('Our little studio');
      await window.getByRole('button', { name: 'Reset', exact: true }).click();
      await expect(pending).toHaveCount(0);
      await expect(window.getByLabel('Server name', { exact: true })).toHaveValue('Just us');
      // Real crop and upload; none of the artwork is live before the unified save.
      for (const [kind, label, title] of [
        ['banner', 'Edit banner', 'Server banner'],
        ['welcomeBanner', 'Edit welcome banner', 'Welcome banner'],
        ['icon', 'Change picture', 'Server picture'],
      ] as const) {
        const choosing = window.waitForEvent('filechooser');
        await window.getByRole('button', { name: label, exact: true }).click();
        await (
          await choosing
        ).setFiles({ name: 'picture.png', mimeType: 'image/png', buffer: png(600, 70, 70, 70, 300) });
        const crop = window.getByRole('dialog', { name: `Add ${title.toLowerCase()}`, exact: true });
        await expect(crop).toBeVisible();
        await crop
          .getByRole('button', { name: kind === 'icon' ? 'Save picture' : 'Save banner', exact: true })
          .click();
        await expect(crop).toHaveCount(0);
        const stored = (await backend.inject({ method: 'GET', url: base, headers })).json().server;
        expect(stored[`${kind}Id`]).toBeNull();
      }
      const arrival = (
        await backend.inject({
          method: 'POST',
          url: `${base}/channels`,
          headers,
          payload: { name: 'arrivals', type: 'text' },
        })
      ).json() as { id: string };
      // Refresh through the normal server directory, keeping the local crops pending.
      await window.getByRole('combobox', { name: 'Default landing channel' }).click();
      await expect(window.getByRole('option', { name: 'arrivals', exact: true })).toBeVisible({
        timeout: 12_000,
      });
      await window.getByRole('option', { name: 'arrivals', exact: true }).click();
      await window.getByLabel('Server name', { exact: true }).fill('Our little studio');
      await window.getByRole('button', { name: 'Save changes', exact: true }).click();
      await expect(pending).toHaveCount(0);
      await expect(window.getByRole('status')).toContainText('Changes saved.');
      const saved = (await backend.inject({ method: 'GET', url: base, headers })).json() as CommunityDetail;
      expect(saved.server.name).toBe('Our little studio');
      expect(saved.server.landingChannelId).toBe(arrival.id);
      for (const field of ['iconId', 'bannerId', 'welcomeBannerId'] as const)
        expect(saved.server[field]).toMatch(/^[a-f0-9]{64}$/);
      await window.getByRole('button', { name: 'Close dialog', exact: true }).click();
      await window.getByRole('button', { name: 'Server settings and members' }).click();
      await window.getByRole('button', { name: 'Server', exact: true }).click();
      await expect(window.getByLabel('Server name', { exact: true })).toHaveValue('Our little studio');
      await window.getByRole('button', { name: 'Remove server banner', exact: true }).click();
      await window.getByRole('button', { name: 'Remove welcome banner', exact: true }).click();
      await window.getByRole('button', { name: 'Remove picture', exact: true }).click();
      await window.getByRole('button', { name: 'Save changes', exact: true }).click();
      await expect(pending).toHaveCount(0);
      const removed = (await backend.inject({ method: 'GET', url: base, headers })).json().server;
      expect(removed).toMatchObject({ bannerId: null, welcomeBannerId: null, iconId: null });
      await window.getByRole('button', { name: /Default permissions Set default/ }).click();
      await expect(window.getByRole('tab', { name: 'Permissions', exact: true })).toHaveAttribute(
        'aria-selected',
        'true',
      );
      await expect(window.locator('.role-editor')).toContainText('@everyone');
      await window.getByRole('button', { name: 'Server', exact: true }).click();
      await window.getByRole('button', { name: /Invite settings Manage invite/ }).click();
      await expect(window.getByRole('button', { name: 'Create invite', exact: true })).toBeVisible();
      await window.getByRole('button', { name: 'Server', exact: true }).click();
      await window.getByRole('button', { name: /Moderation & safety Manage members/ }).click();
      await expect(window.getByRole('textbox', { name: 'Search members' })).toBeVisible();
      await window.getByRole('button', { name: 'Server', exact: true }).click();
      await window
        .locator('.server-danger-zone')
        .getByRole('button', { name: 'Delete server', exact: true })
        .click();
      const deletion = window.getByRole('dialog', { name: 'Delete server', exact: true });
      await expect(deletion).toContainText('cannot be undone');
      await deletion.getByRole('button', { name: 'Cancel', exact: true }).click();
      // No horizontal overflow, the fields and the pending bar remain usable when narrowed.
      await application.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows()[0].setMinimumSize(500, 500),
      );
      for (const [width, height] of [
        [1280, 800],
        [1080, 680],
        [760, 700],
        [1920, 1080],
      ]) {
        await application.evaluate(
          ({ BrowserWindow }, size) => BrowserWindow.getAllWindows()[0].setContentSize(size[0], size[1]),
          [width, height],
        );
        await expect(window.getByLabel('Server name', { exact: true })).toBeVisible();
        expect(
          await window
            .locator('.settings-body')
            .evaluate((element) => element.scrollWidth <= element.clientWidth + 1),
        ).toBe(true);
        await window.screenshot({ path: path.join(artifacts, `server-settings-${width}.png`) });
      }
      await application.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows()[0].setContentSize(1672, 941),
      );
      await window.getByLabel('Server name', { exact: true }).fill('Discard this name');
      await window.getByRole('button', { name: 'Close dialog', exact: true }).click();
      await window
        .getByRole('dialog', { name: 'Discard unsaved changes?', exact: true })
        .getByRole('button', { name: 'Discard changes', exact: true })
        .click();
      await expect(window.locator('.server-settings-screen')).toHaveCount(0);
      expect((await backend.inject({ method: 'GET', url: base, headers })).json().server.name).toBe(
        'Our little studio',
      );
      const guest = (
        await backend.inject({
          method: 'POST',
          url: '/api/auth/register',
          payload: {
            username: 'newcomer',
            displayName: 'Newcomer',
            password: 'Testing server settings!',
          },
        })
      ).json() as AccountSession;
      const { code } = (
        await backend.inject({
          method: 'POST',
          url: `${base}/invites`,
          headers,
          payload: { hours: 1, maxUses: 2 },
        })
      ).json();
      await backend.inject({
        method: 'POST',
        url: '/api/invites/join',
        headers: { authorization: `Bearer ${guest.token}` },
        payload: { code },
      });
      // A newly invited person's device has its own session, independent of the editor.
      newcomerApplication = await electron.launch({
        args: [path.resolve('.')],
        env: {
          ...process.env,
          NODE_ENV: 'test',
          PULSE_TEST_USER_DATA: path.join(dataDir, 'newcomer'),
          VITE_DEV_SERVER_URL: `http://127.0.0.1:${(vite.httpServer!.address() as { port: number }).port}`,
        },
      });
      const guestWindow = await newcomerApplication.firstWindow();
      guestWindow.on('pageerror', (error) => problems.push(error.message));
      await newcomerApplication.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows()[0].setContentSize(1672, 941),
      );
      await guestWindow.getByLabel('Username', { exact: true }).fill('newcomer');
      await guestWindow.getByLabel('Password', { exact: true }).fill('Testing server settings!');
      await guestWindow.getByRole('button', { name: 'Sign in', exact: true }).click();
      const welcome = guestWindow.getByRole('dialog', { name: 'Welcome to Our little studio', exact: true });
      await expect(welcome).toContainText('Feel free to introduce yourself!');
      await guestWindow.screenshot({ path: path.join(artifacts, 'server-welcome-new-member.png') });
      await welcome.getByRole('button', { name: 'Enter server', exact: true }).click();
      await expect(welcome).toHaveCount(0);
      await expect(guestWindow.locator('.room-title strong')).toHaveText('arrivals');
      await guestWindow.reload();
      await expect(guestWindow.locator('.room-title strong')).toHaveText('arrivals');
      await expect(welcome).toHaveCount(0);
      const messages = (
        await backend.inject({ method: 'GET', url: `/api/channels/${arrival.id}/messages`, headers })
      ).json();
      expect(messages.messages).toHaveLength(0);
      expect(problems).toEqual([]);
    }
    if (process.env.PULSE_SETTINGS_REFERENCE) {
      const comparisonCycles =
        process.env.PULSE_SETTINGS_COMPARE_CYCLE === 'all'
          ? ['cycle-1', 'cycle-2', 'cycle-3', cycle]
          : [process.env.PULSE_SETTINGS_COMPARE_CYCLE ?? cycle];
      for (const comparisonCycle of [...new Set(comparisonCycles)]) {
        const source = `data:image/png;base64,${(await readFile(process.env.PULSE_SETTINGS_REFERENCE)).toString('base64')}`;
        const render = `data:image/png;base64,${(await readFile(path.join(artifacts, `server-settings-${comparisonCycle}.png`))).toString('base64')}`;
        const html = `<html><head><meta charset="UTF-8"><style>*{box-sizing:border-box}body{margin:0;background:#101315;color:#e4e9ec;font:13px 'Segoe UI',sans-serif}.pair{display:grid;grid-template-columns:1fr 1fr;gap:2px}header{height:36px;padding:9px 16px;background:#23292d}img{display:block;width:100%}.crop{height:375px;position:relative;overflow:hidden}.crop img{position:absolute;max-width:none;width:1672px;left:-360px;top:-112px}.note{padding:12px 16px;color:#adb7bd;font-size:12px}</style></head><body><div class="pair"><section><header>Reference supplied by user</header><img src="${source}"></section><section><header>Pulse Room · ${comparisonCycle} · real local test account</header><img src="${render}"></section></div><p class="note">Identity and onboarding detail at native scale. Counts and creation date reflect the isolated test database.</p><div class="pair"><section><div class="crop"><img src="${source}"></div></section><section><div class="crop"><img src="${render}"></div></section></div></body></html>`;
        await writeFile(path.join(artifacts, `comparison-${comparisonCycle}.html`), html);
        // Render the comparison document in a separate isolated test window;
        // the application's own navigation protections remain enabled.
        const reviewing = application.waitForEvent('window');
        await application.evaluate(
          async ({ BrowserWindow }, file) => {
            const review = new BrowserWindow({
              show: false,
              width: 1672,
              height: 970,
              frame: false,
              webPreferences: {
                sandbox: true,
                nodeIntegration: false,
                contextIsolation: true,
                backgroundThrottling: false,
              },
            });
            await review.loadFile(file);
          },
          path.join(path.resolve(artifacts), `comparison-${comparisonCycle}.html`),
        );
        const review = await reviewing;
        await review
          .locator('img')
          .evaluateAll((images) => Promise.all(images.map((image) => (image as HTMLImageElement).decode())));
        await review.screenshot({ path: path.join(artifacts, `comparison-${comparisonCycle}.png`) });
        await review.close();
      }
    }
  } finally {
    if (newcomerApplication) {
      await newcomerApplication
        .evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().forEach((window) => window.destroy()))
        .catch(() => undefined);
      await newcomerApplication.close();
    }
    await application
      .evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().forEach((window) => window.destroy()))
      .catch(() => undefined);
    await application.close();
    await vite.close();
    await backend.close();
    if (path.dirname(path.resolve(dataDir)) !== path.resolve(os.tmpdir()) || !path.basename(dataDir).startsWith('pulse-settings-e2e-')) {
      throw new Error('Refusing to remove a directory outside the settings test workspace.');
    }
    await rm(dataDir, { recursive: true, force: true });
  }
});
