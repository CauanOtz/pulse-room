import { _electron as electron, expect, test } from '@playwright/test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createServer as createViteServer } from 'vite';
import type { UpdateStatus } from '../../src/shared/desktop-api';

/**
 * A release announced in a corner while the app is open. The updater only
 * runs in a packaged build, so the main process speaks for it here.
 */
test('a new version is offered in a notice that can be put off or taken at once', async () => {
  test.setTimeout(120_000);
  const dataDir = await mkdtemp(path.join(os.tmpdir(), 'pulse-update-prompt-'));
  const { version } = JSON.parse(await readFile('package.json', 'utf8')) as { version: string };
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
      PULSE_TEST_USER_DATA: path.join(dataDir, 'profile'),
      VITE_DEV_SERVER_URL: `http://127.0.0.1:${(vite.httpServer!.address() as { port: number }).port}`,
    },
  });
  try {
    const window = await application.firstWindow();
    const problems: string[] = [];
    window.on('pageerror', (error) => problems.push(error.message));
    await application.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].setContentSize(1280, 800),
    );
    await window.locator('#root > *').first().waitFor();
    const send = (status: UpdateStatus) =>
      application.evaluate(({ BrowserWindow }, next) => {
        BrowserWindow.getAllWindows()[0].webContents.send('updates:status', next);
      }, status);

    // Nothing to say about the version already running.
    await send({ state: 'available', version });
    const notice = window.getByRole('dialog', { name: 'Update available' });
    await window.waitForTimeout(400);
    await expect(notice).toHaveCount(0);

    await send({ state: 'downloading', percent: 37, version: '9.9.9', bytesPerSecond: 4_000_000 });
    await expect(notice).toBeVisible();
    await expect(notice.getByLabel(`From version ${version} to version 9.9.9`)).toContainText(`v${version}`);
    await expect(notice).toContainText('v9.9.9');
    await expect(notice).toContainText('Downloading in the background · 37%');
    await window.waitForTimeout(800);
    await window.screenshot({ path: 'test-results/update-prompt.png' });

    // Closed, it stays closed for that version...
    await notice.getByRole('button', { name: 'Close the update notice' }).click();
    await expect(notice).toBeHidden();
    await send({ state: 'downloaded', version: '9.9.9' });
    await window.waitForTimeout(400);
    await expect(notice).toHaveCount(0);

    // ...and comes back for a newer one.
    await send({ state: 'downloaded', version: '9.9.10' });
    await expect(notice).toBeVisible();
    await expect(notice).toContainText('Downloaded and ready to install.');
    const confirm = notice.getByRole('button', { name: 'Update now' });
    await confirm.click();
    await expect(notice.getByRole('button', { name: 'Updating' })).toBeDisabled();
    await window.waitForTimeout(450);
    await window.screenshot({ path: 'test-results/update-prompt-confirmed.png' });

    // The tick holds a moment, then the update screen takes over.
    await expect(window.getByRole('dialog', { name: /Installing/ })).toBeVisible();
    await expect(notice).toBeHidden();
    // Nothing was really downloaded, so the main process declines to install.
    await window.waitForTimeout(1_500);
    expect(await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length)).toBe(1);
    expect(problems).toEqual([]);
  } finally {
    await application.close();
    await vite.close();
    await rm(dataDir, { recursive: true, force: true }).catch(() => undefined);
  }
});
