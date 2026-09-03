import { readFileSync } from 'node:fs';
import path from 'node:path';
import { _electron as electron, expect, test } from '@playwright/test';

const { version } = JSON.parse(readFileSync(path.resolve('package.json'), 'utf8')) as { version: string };

test('launches the secured desktop shell and completes the join flow', async () => {
  // No fake devices here: this test has to capture the real monitor.
  const application = await electron.launch({
    args: [path.resolve('.')],
    env: { ...process.env, NODE_ENV: 'test' },
  });

  const problems: string[] = [];

  try {
    const window = await application.firstWindow();
    window.on('console', (message) => {
      if (message.type() === 'error') problems.push(`console: ${message.text()}`);
    });
    window.on('pageerror', (error) => problems.push(`page error: ${error.message}`));
    window.on('crash', () => problems.push('the renderer crashed'));
    await window.evaluate(() => localStorage.removeItem('pulse-room:settings:v1'));
    await expect(window).toHaveTitle('Pulse Room');
    await expect(window.getByRole('heading', { name: 'Come as you are' })).toBeVisible();
    await window.getByRole('button', { name: 'Join voice' }).click();
    await expect(window.getByRole('heading', { name: 'The room is yours' })).toBeVisible();
    await expect(window.getByRole('button', { name: 'Share full screen' })).toBeVisible();

    await window.getByRole('button', { name: 'Open settings' }).click();
    await expect(window.getByRole('heading', { name: 'Voice and video' })).toBeVisible();
    await window.getByLabel('Microphone gain').fill('120');
    await window.getByRole('slider', { name: 'Noise gate' }).fill('70');
    await window.getByRole('checkbox', { name: /Expand screen levels/ }).check();
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
    await expect(window.getByLabel('Shared screen')).toHaveClass(/is-expanded/);
    await window.screenshot({ path: 'test-results/pulse-room-stage.png', fullPage: true });

    await window.getByRole('button', { name: 'Enter full screen' }).click();
    await expect(window.getByRole('button', { name: 'Exit full screen' })).toBeVisible();
    await window.getByRole('button', { name: 'Exit full screen' }).click();
    await expect(window.getByRole('button', { name: 'Enter full screen' })).toBeVisible();

    await window.getByRole('button', { name: 'Stop sharing' }).click();
    await expect(window.getByRole('button', { name: 'Share full screen' })).toBeVisible();
    await expect(window.getByRole('heading', { name: 'The room is yours' })).toBeVisible();

    const bridgeVersion = await window.evaluate(() => window.desktop?.app.getVersion());
    expect(bridgeVersion).toBe(version);
  } finally {
    problems.forEach((problem) => console.log('Renderer problem:', problem));
    await application.close();
  }
});
