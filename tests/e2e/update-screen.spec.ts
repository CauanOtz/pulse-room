import { _electron as electron, expect, test } from '@playwright/test';
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createServer as createViteServer } from 'vite';
import type { UpdateStatus } from '../../src/shared/desktop-api';

/**
 * The app's own update screen instead of the installer's wizard. The updater
 * only runs in a packaged build, so the main process speaks for it here: it
 * sends the page the same news the updater would.
 */
test('updates on a screen of its own and greets the new version after the restart', async () => {
  test.setTimeout(120_000);
  const dataDir = await mkdtemp(path.join(os.tmpdir(), 'pulse-update-screen-'));
  const profile = path.join(dataDir, 'profile');
  const { version } = JSON.parse(await readFile('package.json', 'utf8')) as { version: string };
  // What the previous version leaves behind as it hands over to the installer.
  await mkdir(profile, { recursive: true });
  const marker = path.join(profile, 'pending-update.json');
  await writeFile(marker, JSON.stringify({ from: '0.0.1', to: version }));

  const vite = await createViteServer({
    configFile: path.resolve('vite.config.mts'),
    cacheDir: path.join(dataDir, 'vite-cache'),
    server: { host: '127.0.0.1', port: 0 },
  });
  await vite.listen();
  const application = await electron.launch({
    args: [path.resolve('.')],
    env: {
      ...process.env,
      NODE_ENV: 'test',
      PULSE_TEST_USER_DATA: profile,
      VITE_DEV_SERVER_URL: `http://127.0.0.1:${(vite.httpServer!.address() as { port: number }).port}`,
    },
  });
  try {
    const window = await application.firstWindow();
    const problems: string[] = [];
    window.on('pageerror', (error) => problems.push(error.message));
    await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(1280, 800));
    const screen = window.getByRole('dialog', { name: /Updated/ });

    // After the restart: said once, then out of the way.
    await expect(screen).toBeVisible();
    await expect(screen).toContainText(`From 0.0.1 to ${version}`);
    await window.waitForTimeout(700);
    await window.screenshot({ path: 'test-results/update-screen-finished.png' });
    await expect(screen).toBeHidden({ timeout: 6_000 });
    await expect.poll(() => stat(marker).then(() => true, () => false)).toBe(false);

    const send = (status: UpdateStatus) =>
      application.evaluate(({ BrowserWindow }, next) => {
        BrowserWindow.getAllWindows()[0].webContents.send('updates:status', next);
      }, status);
    await window.evaluate(async () => {
      const module = await import('/src/renderer/components/update-screen.tsx');
      module.updateFlow.start();
    });
    await send({ state: 'downloading', percent: 42, version: '9.9.9', bytesPerSecond: 6.4 * 1_048_576 });
    const updating = window.getByRole('dialog', { name: /Updating/ });
    await expect(updating).toBeVisible();
    await expect(updating.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '42');
    await expect(updating).toContainText('6.4 MB/s');
    await window.waitForTimeout(1_200);
    await window.screenshot({ path: 'test-results/update-screen-downloading.png' });

    await send({ state: 'downloaded', version: '9.9.9' });
    await expect(window.getByRole('dialog', { name: /Installing/ })).toBeVisible();
    await expect(window.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '100');
    await window.waitForTimeout(600);
    await window.screenshot({ path: 'test-results/update-screen-installing.png' });
    // Nothing was really downloaded, so the main process declines to install
    // and the app is still here.
    await window.waitForTimeout(1_500);
    expect(await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length)).toBe(1);
    expect(problems).toEqual([]);
  } finally {
    await application.close();
    await vite.close();
    await rm(dataDir, { recursive: true, force: true }).catch(() => undefined);
  }
});
