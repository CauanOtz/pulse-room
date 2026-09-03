import { readFileSync } from 'node:fs';
import path from 'node:path';
import { _electron as electron, expect, test } from '@playwright/test';

const { version } = JSON.parse(readFileSync(path.resolve('package.json'), 'utf8')) as { version: string };

test('launches the secured desktop shell and completes the join flow', async () => {
  const application = await electron.launch({
    args: [path.resolve('.')],
    env: { ...process.env, NODE_ENV: 'test' },
  });

  try {
    const window = await application.firstWindow();
    await expect(window).toHaveTitle('Pulse Room');
    await expect(window.getByRole('heading', { name: 'Come as you are' })).toBeVisible();
    await window.getByRole('button', { name: 'Join voice' }).click();
    await expect(window.getByRole('heading', { name: 'The room is yours' })).toBeVisible();
    await expect(window.getByRole('button', { name: 'Share full screen' })).toBeVisible();

    await window.getByRole('button', { name: 'Open settings' }).click();
    await expect(window.getByRole('heading', { name: 'Voice and video' })).toBeVisible();
    await window.getByLabel('Microphone gain').fill('120');
    await window.getByRole('button', { name: 'Check now' }).click();
    await expect(window.getByText(`Pulse Room ${version} is current.`)).toBeVisible();
    await window.getByRole('button', { name: 'Save changes' }).click();

    await window.getByRole('button', { name: 'Share full screen' }).click();
    const shareDialog = window.getByRole('dialog', { name: 'Share your full screen' });
    await expect(shareDialog).toBeVisible();
    await expect(window.getByText('System audio is included automatically on Windows.')).toBeVisible();
    await shareDialog.getByRole('button', { name: 'Share full screen' }).click();
    await expect(window.getByRole('button', { name: 'Stop sharing' })).toBeVisible();
    await expect(window.getByLabel('Shared screen')).toBeVisible();
    await window.screenshot({ path: 'test-results/pulse-room-stage.png', fullPage: true });
    await window.getByRole('button', { name: 'Stop sharing' }).click();
    await expect(window.getByRole('heading', { name: 'The room is yours' })).toBeVisible();

    const bridgeVersion = await window.evaluate(() => window.desktop?.app.getVersion());
    expect(bridgeVersion).toBe(version);
  } finally {
    await application.close();
  }
});
