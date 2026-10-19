import { _electron as electron, expect, test } from '@playwright/test';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createServer as createViteServer } from 'vite';
import { createServer } from '../../server/app';
import { TestDatabase } from '../helpers/database';
import type { AccountSession, CommunityDetail } from '../../src/shared/community';
import { Permission } from '../../src/shared/permissions';
import { png } from '../helpers/images';

test('role workspace edits identity, permissions, hierarchy and members through real APIs', async () => {
  test.setTimeout(180_000);
  const dataDir = await mkdtemp(path.join(os.tmpdir(), 'pulse-role-workspace-'));
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
      payload: { username: 'owner', displayName: 'Owner', password: 'Testing role workspace!' },
    })
  ).json() as AccountSession;
  const headers = { authorization: `Bearer ${owner.token}` };
  const server = (
    await backend.inject({ method: 'POST', url: '/api/servers', headers, payload: { name: 'Just us' } })
  ).json() as { id: string };
  for (const [name, colour] of [
    ['Friend', '#5144f6'],
    ['Neighbour', '#2bb467'],
    ['Guest', '#969fa5'],
  ]) {
    await backend.inject({
      method: 'POST',
      url: `/api/servers/${server.id}/roles`,
      headers,
      payload: {
        name,
        colour,
        hoist: false,
        permissions: name === 'Friend' ? Permission.ViewChannels | Permission.SendMessages : 0,
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
      PULSE_TEST_USER_DATA: path.join(dataDir, 'profile'),
      VITE_DEV_SERVER_URL: `http://127.0.0.1:${(vite.httpServer!.address() as { port: number }).port}`,
    },
  });
  try {
    const window = await application.firstWindow();
    await application.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].setContentSize(1790, 878),
    );
    await window.getByLabel('Username', { exact: true }).fill('owner');
    await window.getByLabel('Password', { exact: true }).fill('Testing role workspace!');
    await window.getByRole('button', { name: 'Sign in', exact: true }).click();
    await window.getByRole('button', { name: 'Server settings and members' }).click();
    await window.getByRole('button', { name: 'Roles', exact: true }).click();
    await window.getByRole('tab', { name: 'Permissions', exact: true }).click();
    const artifacts = process.env.PULSE_ROLES_ARTIFACTS ?? 'test-results';
    const cycle = process.env.PULSE_ROLES_CYCLE ?? 'final';
    await mkdir(artifacts, { recursive: true });
    await window.screenshot({ path: path.join(artifacts, `roles-${cycle}.png`) });
    const detail = (
      await backend.inject({ method: 'GET', url: `/api/servers/${server.id}`, headers })
    ).json() as CommunityDetail;
    expect(detail.roles?.find((role) => role.name === 'Friend')).toBeDefined();
    if (process.env.PULSE_ROLES_VISUAL_ONLY !== '1') {
      const problems: string[] = [];
      window.on('pageerror', (error) => problems.push(error.message));
      const base = `/api/servers/${server.id}`;
      const read = async () =>
        (await backend.inject({ method: 'GET', url: base, headers })).json() as CommunityDetail;
      const roleId = detail.roles!.find((role) => role.name === 'Friend')!.id;
      const endpoint = `${base}/roles/${roleId}`;
      const pending = window.getByRole('region', { name: 'Unsaved role changes' });
      const categories = window.getByRole('navigation', { name: 'Permission categories' });
      await window.getByLabel('Search roles', { exact: true }).fill('neigh');
      await expect(window.getByRole('button', { name: 'Select role Neighbour', exact: true })).toBeVisible();
      await expect(window.getByRole('button', { name: 'Select role Guest', exact: true })).toHaveCount(0);
      await expect(window.getByLabel('Role name', { exact: true })).toHaveValue('Friend');
      await window.getByLabel('Search roles', { exact: true }).fill('');
      await window.getByLabel('Role name', { exact: true }).fill('Community');
      await window
        .getByLabel('Role description', { exact: true })
        .fill('People who make this community welcoming.');
      await window.getByLabel('Custom role colour', { exact: true }).fill('#667788');
      await window.getByRole('button', { name: 'Select all', exact: true }).click();
      await categories.getByRole('button', { name: 'Voice channels', exact: true }).click();
      await expect(window.getByRole('switch', { name: 'Connect', exact: true })).not.toBeChecked();
      await categories.getByRole('button', { name: 'General', exact: true }).click();
      await pending.getByRole('button', { name: 'Save changes', exact: true }).click();
      await expect(pending).toHaveCount(0);
      expect((await read()).roles!.find((role) => role.id === roleId)).toMatchObject({
        name: 'Community',
        colour: '#667788',
        description: 'People who make this community welcoming.',
        permissions:
          Permission.ViewChannels |
          Permission.SendMessages |
          Permission.CreateInvites |
          Permission.ManageMessages,
      });

      await window.getByLabel('Role name', { exact: true }).fill('Unsaved name');
      await window.getByRole('tab', { name: /Members/ }).click();
      await expect(window.getByLabel('Role name', { exact: true })).toHaveValue('Unsaved name');
      await window.getByRole('button', { name: 'Select role Guest', exact: true }).click();
      const switching = window.getByRole('dialog', { name: 'Discard role changes?', exact: true });
      await switching.getByRole('button', { name: 'Cancel', exact: true }).click();
      await window
        .getByRole('navigation', { name: 'Server settings sections' })
        .getByRole('button', { name: /^Members/ })
        .click();
      const leaving = window.getByRole('dialog', { name: 'Discard unsaved changes?', exact: true });
      await leaving.getByRole('button', { name: 'Cancel', exact: true }).click();
      await window.getByRole('button', { name: 'Close dialog', exact: true }).click();
      await leaving.getByRole('button', { name: 'Cancel', exact: true }).click();
      await pending.getByRole('button', { name: 'Discard', exact: true }).click();
      await expect(window.getByLabel('Role name', { exact: true })).toHaveValue('Community');

      // A remote edit never replaces the local draft; saving refreshes the conflict.
      await window.getByLabel('Role description', { exact: true }).fill('Local description');
      expect(
        (await backend.inject({ method: 'PATCH', url: endpoint, headers, payload: { hoist: true } }))
          .statusCode,
      ).toBe(200);
      await pending.getByRole('button', { name: 'Save changes', exact: true }).click();
      await expect(window.getByText('This role changed elsewhere.', { exact: true })).toBeVisible();
      await expect(window.getByLabel('Role description', { exact: true })).toHaveValue('Local description');
      await window.getByRole('button', { name: 'Keep my changes', exact: true }).click();
      await pending.getByRole('button', { name: 'Save changes', exact: true }).click();
      await expect(pending).toHaveCount(0);
      expect((await read()).roles!.find((role) => role.id === roleId)).toMatchObject({
        description: 'Local description',
        hoist: true,
      });

      for (const red of [80, 130]) {
        const choosing = window.waitForEvent('filechooser');
        await window
          .getByRole('button', { name: red === 80 ? 'Add icon' : 'Change icon', exact: true })
          .click();
        await (
          await choosing
        ).setFiles({ name: 'role.png', mimeType: 'image/png', buffer: png(100, red, red, red) });
        const crop = window.getByRole('dialog', { name: 'Add role icon', exact: true });
        await crop.getByRole('button', { name: 'Save picture', exact: true }).click();
        await expect(crop).toHaveCount(0);
        await expect(window.getByAltText('Role icon preview')).toBeVisible();
        await pending.getByRole('button', { name: 'Save changes', exact: true }).click();
        await expect(pending).toHaveCount(0);
        expect((await read()).roles!.find((role) => role.id === roleId)?.iconId).toMatch(/^[a-f0-9]{64}$/);
      }
      await window.getByRole('button', { name: 'Remove icon', exact: true }).click();
      await pending.getByRole('button', { name: 'Save changes', exact: true }).click();
      await expect(pending).toHaveCount(0);
      expect((await read()).roles!.find((role) => role.id === roleId)?.iconId).toBeNull();

      const users: AccountSession[] = [];
      const { code } = (
        await backend.inject({
          method: 'POST',
          url: `${base}/invites`,
          headers,
          payload: { hours: 1, maxUses: 3 },
        })
      ).json();
      for (const username of ['friend', 'neighbour']) {
        const session = (
          await backend.inject({
            method: 'POST',
            url: '/api/auth/register',
            payload: {
              username,
              displayName: username === 'friend' ? 'Friend' : 'Neighbour',
              password: 'Testing role workspace!',
            },
          })
        ).json() as AccountSession;
        users.push(session);
        expect(
          (
            await backend.inject({
              method: 'POST',
              url: '/api/invites/join',
              headers: { authorization: `Bearer ${session.token}` },
              payload: { code },
            })
          ).statusCode,
        ).toBe(200);
      }
      // Refresh through the actual directory, then associate two real members in one operation.
      await window.getByRole('button', { name: 'Close dialog', exact: true }).click();
      await window.getByRole('button', { name: 'Server settings and members' }).click();
      await window.getByRole('button', { name: 'Roles', exact: true }).click();
      await window.getByRole('tab', { name: /Members/ }).click();
      await window.getByRole('button', { name: 'Add members', exact: true }).click();
      const adding = window.getByRole('dialog', { name: 'Add members to Community', exact: true });
      await adding.getByLabel('Search members to add').fill('friend');
      await adding.getByRole('checkbox', { name: /Friend/ }).check();
      await adding.getByLabel('Search members to add').fill('neigh');
      await adding.getByRole('checkbox', { name: /Neighbour/ }).check();
      await adding.getByRole('button', { name: 'Add', exact: true }).click();
      await expect(adding).toHaveCount(0);
      await expect(window.locator('.role-members-list li')).toHaveCount(2);
      await window.screenshot({ path: path.join(artifacts, 'roles-members.png') });
      await window.getByLabel('Search role members').fill('friend');
      await expect(window.locator('.role-members-list li')).toHaveCount(1);
      await window.getByRole('button', { name: 'Actions for Friend', exact: true }).click();
      await window.getByRole('menuitem', { name: 'Remove Friend from Community', exact: true }).click();
      await expect(window.locator('.role-members-list li')).toHaveCount(0);
      expect((await read()).members.find((member) => member.id === users[0].user.id)?.roleIds).not.toContain(
        roleId,
      );
      await window.getByLabel('Search role members').fill('');
      await window.getByRole('tab', { name: 'Settings', exact: true }).click();
      await window.getByRole('switch', { name: 'Display separately', exact: true }).uncheck();
      await pending.getByRole('button', { name: 'Save changes', exact: true }).click();
      await expect(pending).toHaveCount(0);
      await window.screenshot({ path: path.join(artifacts, 'roles-settings.png') });

      const order = window.getByRole('list', { name: 'Roles, highest first' });
      await window.getByRole('button', { name: 'Reorder Guest', exact: true }).focus();
      await window.keyboard.press('Alt+ArrowUp');
      await expect(order.locator('li strong').nth(1)).toHaveText('Guest');
      await order.locator('li', { hasText: 'Guest' }).dragTo(order.locator('li', { hasText: 'Community' }));
      await expect(order.locator('li strong').first()).toHaveText('Guest');

      await window.getByRole('button', { name: 'Create role', exact: true }).click();
      const creating = window.getByRole('dialog', { name: 'Create role', exact: true });
      await creating.getByLabel('Role name', { exact: true }).fill('Temporary');
      await creating.getByLabel('Description (optional)').fill('A role created in the desktop flow.');
      await creating.getByRole('button', { name: 'Create role', exact: true }).click();
      await expect(creating).toHaveCount(0);
      await expect(window.getByLabel('Role name', { exact: true })).toHaveValue('Temporary');
      await window.getByRole('tab', { name: 'Settings', exact: true }).click();
      await window.getByRole('button', { name: 'Delete role', exact: true }).click();
      const deleting = window.getByRole('dialog', { name: 'Delete Temporary?', exact: true });
      await deleting.getByRole('button', { name: 'Delete role', exact: true }).click();
      await expect(deleting).toHaveCount(0);
      await expect(window.getByRole('button', { name: 'Select role Temporary', exact: true })).toHaveCount(0);
      expect((await read()).roles!.some((role) => role.name === 'Temporary')).toBe(false);

      await window.getByRole('button', { name: 'Select role @everyone', exact: true }).click();
      await expect(window.getByLabel('Role name', { exact: true })).toBeDisabled();
      await window.getByRole('tab', { name: /Members/ }).click();
      await expect(window.locator('.role-members-list li')).toHaveCount(3);
      await expect(window.getByRole('button', { name: 'Add members', exact: true })).toHaveCount(0);
      await window.getByRole('button', { name: 'Select role Community', exact: true }).click();
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
        await expect(window.getByLabel('Role name', { exact: true })).toBeVisible();
        expect(
          await window
            .locator('.settings-body')
            .evaluate((element) => element.scrollWidth <= element.clientWidth + 1),
        ).toBe(true);
        expect(
          await window
            .locator('.role-details-panel')
            .evaluate((element) => element.scrollWidth <= element.clientWidth + 1),
        ).toBe(true);
        await window.getByLabel('Role description', { exact: true }).fill(`Responsive draft ${width}`);
        await expect(pending.getByRole('button', { name: 'Save changes', exact: true })).toBeInViewport();
        await pending.getByRole('button', { name: 'Discard', exact: true }).click();
        if (width === 760) {
          await window.getByRole('button', { name: 'Choose a role', exact: true }).click();
          await expect(
            window.getByRole('button', { name: 'Select role Community', exact: true }),
          ).toBeVisible();
          await window.getByRole('button', { name: 'Select role Community', exact: true }).click();
          await expect(window.getByRole('button', { name: 'Choose a role', exact: true })).toHaveAttribute(
            'aria-expanded',
            'false',
          );
        }
        await window.locator('.role-details-panel').evaluate((element) => (element.scrollTop = 0));
        await window.screenshot({ path: path.join(artifacts, `roles-${width}.png`) });
      }
      expect(problems).toEqual([]);
    }
    const reference = process.env.PULSE_ROLES_REFERENCE;
    if (reference) {
      const source = `data:image/png;base64,${(await readFile(reference)).toString('base64')}`;
      for (const comparisonCycle of [...new Set(['cycle-1', cycle])]) {
        const render = `data:image/png;base64,${(await readFile(path.join(artifacts, `roles-${comparisonCycle}.png`))).toString('base64')}`;
        const html = `<html><head><meta charset="UTF-8"><style>*{box-sizing:border-box}body{margin:0;background:#101315;color:#e4e9ec;font:13px 'Segoe UI',sans-serif}.pair{display:grid;grid-template-columns:1fr 1fr;gap:2px}header{height:36px;padding:9px 16px;background:#23292d}img{display:block;width:100%}.crop{height:440px;position:relative;overflow:hidden}.crop img{position:absolute;max-width:none;width:1790px;left:-691px;top:-110px}.note{padding:12px 16px;color:#adb7bd;font-size:12px}</style></head><body><div class="pair"><section><header>Referência fornecida</header><img src="${source}"></section><section><header>Pulse Room · ${comparisonCycle} · banco isolado de testes</header><img src="${render}"></section></div><p class="note">Detalhe do editor na escala original. Quantidades reais; Owner é status protegido, separado dos cargos configuráveis.</p><div class="pair"><section><div class="crop"><img src="${source}"></div></section><section><div class="crop"><img src="${render}"></div></section></div></body></html>`;
        const file = path.join(path.resolve(artifacts), `comparison-${comparisonCycle}.html`);
        await writeFile(file, html);
        const reviewing = application.waitForEvent('window');
        await application.evaluate(async ({ BrowserWindow }, file) => {
          const review = new BrowserWindow({
            show: false,
            width: 1790,
            height: 980,
            frame: false,
            webPreferences: {
              sandbox: true,
              nodeIntegration: false,
              contextIsolation: true,
              backgroundThrottling: false,
            },
          });
          await review.loadFile(file);
        }, file);
        const review = await reviewing;
        await review
          .locator('img')
          .evaluateAll((images) => Promise.all(images.map((image) => (image as HTMLImageElement).decode())));
        await review.screenshot({ path: path.join(artifacts, `comparison-${comparisonCycle}.png`) });
        await review.close();
      }
    }
  } finally {
    await application
      .evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().forEach((window) => window.destroy()))
      .catch(() => undefined);
    await application.close();
    await vite.close();
    await backend.close();
    if (
      path.dirname(path.resolve(dataDir)) !== path.resolve(os.tmpdir()) ||
      !path.basename(dataDir).startsWith('pulse-role-workspace-')
    )
      throw new Error('Unsafe test cleanup path');
    await rm(dataDir, { recursive: true, force: true });
  }
});
