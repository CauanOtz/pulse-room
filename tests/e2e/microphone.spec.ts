import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { _electron as electron, expect, test } from '@playwright/test';

/**
 * The noise gate runs in an AudioWorklet, which loads from a bundled asset over
 * file://. That path only exists in a real build, so this test watches the
 * module load and the node itself rather than trusting module resolution.
 */
test('runs the microphone through the noise gate when joining', async () => {
  // Its own profile: one profile means one instance, and these tests must
  // not collide with each other or with an installed Pulse Room.
  const dataDir = await mkdtemp(path.join(os.tmpdir(), 'pulse-microphone-e2e-'));
  const application = await electron.launch({
    args: [path.resolve('.'), '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'],
    env: { ...process.env, NODE_ENV: 'test', PULSE_TEST_USER_DATA: dataDir },
  });

  try {
    const window = await application.firstWindow();

    await window.evaluate(() => {
      // Settings survive between launches, so start from the shipped defaults.
      localStorage.removeItem('pulse-room:settings:v1');

      const store = { modules: [] as string[], failures: [] as string[], nodes: [] as AudioWorkletNode[] };
      (window as any).gateProbe = store;

      const originalAddModule = AudioWorklet.prototype.addModule;
      AudioWorklet.prototype.addModule = async function (url: string, options?: WorkletOptions) {
        store.modules.push(String(url));
        try {
          return await originalAddModule.call(this, url, options);
        } catch (error) {
          store.failures.push(String(error));
          throw error;
        }
      };

      const OriginalNode = window.AudioWorkletNode;
      window.AudioWorkletNode = class extends OriginalNode {
        constructor(context: BaseAudioContext, name: string, options?: AudioWorkletNodeOptions) {
          super(context, name, options);
          store.nodes.push(this);
        }
      } as typeof AudioWorkletNode;
    });

    // Joining opens the microphone, so the room hears you without a second click.
    const you = window.locator('.roster-entry', { hasText: 'You' }).first();
    await window.getByRole('button', { name: 'Lounge' }).click();
    const muteButton = window.locator('.profile-strip').getByRole('button', { name: 'Mute microphone' });
    await expect(muteButton).toBeVisible();
    await expect(you.locator('.roster-flag')).toHaveCount(0);

    await expect
      .poll(async () =>
        window.evaluate(() => {
          const store = (window as any).gateProbe;
          return {
            module: String(store.modules[0] ?? '').split('/').pop(),
            failures: store.failures,
            nodes: store.nodes.length,
            threshold: store.nodes[0]?.parameters.get('threshold')?.value,
            enabled: store.nodes[0]?.parameters.get('enabled')?.value,
          };
        }),
      )
      .toEqual({
        module: expect.stringMatching(/^noise-gate-processor.*\.js$/),
        failures: [],
        nodes: 1,
        // The default noise gate strength of 60 is -50 dBFS.
        threshold: -50,
        enabled: 1,
      });
    await muteButton.click();
    await expect(you.locator('.roster-flag')).toHaveCount(1);
    await window.locator('.profile-strip').getByRole('button', { name: 'Unmute microphone' }).click();
    await expect(you.locator('.roster-flag')).toHaveCount(0);
  } finally {
    await application.close();
    await rm(dataDir, { recursive: true, force: true });
  }
});
