import { readFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { _electron as electron, expect, test } from '@playwright/test';

const { version } = JSON.parse(readFileSync(path.resolve('package.json'), 'utf8')) as { version: string };

test('launches the secured desktop shell and completes the join flow', async () => {
  test.setTimeout(60_000);
  // Its own profile: one profile means one instance, and these tests must
  // not collide with each other or with an installed Pulse Room.
  const dataDir = await mkdtemp(path.join(os.tmpdir(), 'pulse-desktop-e2e-'));
  // No fake devices here: this test has to capture the real monitor.
  const application = await electron.launch({
    args: [path.resolve('.')],
    env: { ...process.env, NODE_ENV: 'test', PULSE_TEST_USER_DATA: dataDir },
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
    // Clicking a voice channel is the whole act of joining it.
    await window.getByRole('button', { name: 'Lounge' }).click();
    await expect(window.locator('.tile-grid .participant-tile')).toHaveCount(4);
    await expect(
      window.locator('.voice-panel').getByRole('button', { name: 'Share full screen' }),
    ).toBeVisible();
    // Proof that this build carries no room credentials: only the demo roster
    // is present, so the test can never walk into a real call.
    await expect(window.locator('.voice-roster')).toContainText('Maya');

    // Audio options live on the person, reached with a right click.
    await window.getByRole('button', { name: 'Audio options for Maya' }).click({ button: 'right' });
    const popover = window.getByRole('dialog', { name: 'Maya audio' });
    await expect(popover).toBeVisible();
    await window.screenshot({ path: 'test-results/pulse-room-popover.png' });
    await popover.getByRole('slider', { name: 'Maya volume' }).fill('160');
    await expect(popover).toContainText('160%');
    await popover.getByRole('button', { name: 'Mute for me' }).click();
    await expect(popover.getByRole('button', { name: 'Unmute for me' })).toBeVisible();
    await window.keyboard.press('Escape');
    await expect(popover).toBeHidden();

    // Icon-only controls say what they are, without the operating system's tip.
    await window.locator('.profile-strip').getByRole('button', { name: 'Your profile' }).hover();
    // The call is running by now, so the status says so.
    await expect(window.getByRole('tooltip')).toContainText('In voice');
    await window.screenshot({ path: 'test-results/pulse-room-status-tooltip.png' });
    await window.locator('.room-header').hover();

    // Choosing a device: the list belongs to the window, not to the screen edge.
    await window.locator('.profile-strip').getByRole('button', { name: 'Choose microphone' }).click();
    const devices = window.locator('[role="menu"]');
    await expect(devices.getByRole('menuitemradio', { name: 'System default' })).toBeVisible();
    const fits = await devices.evaluate((element) => {
      const box = element.getBoundingClientRect();
      return box.top >= 0 && box.bottom <= window.innerHeight && box.right <= window.innerWidth;
    });
    expect(fits).toBe(true);
    await window.keyboard.press('Escape');

    await application.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].setContentSize(1080, 680),
    );
    await window.locator('.profile-strip').getByRole('button', { name: 'Open audio settings' }).click();
    await expect(window.getByRole('heading', { name: 'Voice and video' })).toBeVisible();
    await window.screenshot({ path: 'test-results/pulse-room-settings.png' });
    expect(
      await window.locator('.settings-dialog').evaluate((element) => {
        const rect = element.getBoundingClientRect();
        return rect.top >= 0 && rect.bottom <= innerHeight && element.scrollWidth <= element.clientWidth;
      }),
    ).toBe(true);
    await window.getByLabel('Microphone gain').fill('120');
    await window.getByRole('slider', { name: 'Noise gate' }).fill('70');
    await window.getByRole('checkbox', { name: /Expand screen levels/ }).check();
    await window.getByRole('button', { name: 'Check now' }).click();
    await expect(window.getByText(`Pulse Room ${version} is current.`)).toBeVisible();
    await window.screenshot({ path: 'test-results/pulse-room-settings-quality.png' });
    await window.getByRole('button', { name: 'Save changes' }).click();
    await application.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].setContentSize(1440, 900),
    );

    await window.locator('.voice-panel').getByRole('button', { name: 'Share full screen' }).click();
    const shareDialog = window.getByRole('dialog', { name: 'Share your full screen' });
    await expect(shareDialog).toBeVisible();
    await expect(window.getByText('System audio is included automatically on Windows.')).toBeVisible();
    await shareDialog.getByRole('button', { name: 'Share full screen' }).click();
    await expect(window.locator('.voice-panel').getByRole('button', { name: 'Stop sharing' })).toBeVisible();
    await expect(window.getByLabel('Shared screen')).toBeVisible();
    await expect(window.getByLabel('Shared screen')).toHaveClass(/is-expanded/);
    await window.screenshot({ path: 'test-results/pulse-room-stage.png', fullPage: true });

    // The controls stay while the pointer is on them, and fade once it leaves.
    const toolbar = window.locator('.live-toolbar');
    await window.mouse.move(700, 300);
    await expect(toolbar).toHaveClass(/is-hidden/);
    await window.locator('.stage-live').hover();
    await expect(toolbar).not.toHaveClass(/is-hidden/);

    await window.getByRole('button', { name: 'Enter full screen' }).click();
    await expect(window.getByRole('button', { name: 'Exit full screen' })).toBeVisible();
    await window.getByRole('button', { name: 'Exit full screen' }).click();
    await expect(window.getByRole('button', { name: 'Enter full screen' })).toBeVisible();

    // The stream quality menu rides on the caret beside the share button.
    await window.locator('.stage-live').hover();
    await window.locator('.call-dock').getByRole('button', { name: 'Stream options' }).click();
    const streamMenu = window.getByRole('menu', { name: 'Stream options' });
    await expect(streamMenu.getByRole('menuitemradio', { name: /1080p . 30 fps/ })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    await window.keyboard.press('Escape');

    await window.locator('.stage-live').hover();
    await window.locator('.call-dock').getByRole('button', { name: 'Stop sharing' }).click();
    await expect(
      window.locator('.voice-panel').getByRole('button', { name: 'Share full screen' }),
    ).toBeVisible();
    await expect(window.locator('.tile-grid .participant-tile')).toHaveCount(4);

    // The sidebar moves the call between voice channels.
    await window.getByRole('button', { name: 'Game room' }).click();
    await expect(window.locator('.voice-panel')).toContainText('Game room');
    await expect(window.getByRole('button', { name: 'Game room' })).toHaveAttribute('aria-current', 'true');
    await window.getByRole('button', { name: 'Lounge' }).click();
    await expect(window.locator('.voice-panel')).toContainText('Lounge');

    // Closing the window must not end a call: the application waits in the tray.
    await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].close());
    const survived = await application.evaluate(({ BrowserWindow }) => ({
      windows: BrowserWindow.getAllWindows().length,
      visible: BrowserWindow.getAllWindows()[0]?.isVisible(),
    }));
    expect(survived).toEqual({ windows: 1, visible: false });

    await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].show());
    await expect(window.locator('.app-shell')).toBeVisible();

    const bridgeVersion = await window.evaluate(() => window.desktop?.app.getVersion());
    expect(bridgeVersion).toBe(version);
    expect(problems).toEqual([]);
  } finally {
    problems.forEach((problem) => console.log('Renderer problem:', problem));
    await application.close();
    await rm(dataDir, { recursive: true, force: true });
  }
});
