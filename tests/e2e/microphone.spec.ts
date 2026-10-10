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
            module: String(store.modules[0] ?? '')
              .split('/')
              .pop(),
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

/**
 * Voice isolation is a WebAssembly network in a worklet of its own. Both have
 * to load from the packaged app over file://, where fetch reads nothing, and
 * the network has to be allowed to compile under the page's content policy.
 * When it is not, the node is created and passes nothing but silence, with no
 * error anywhere, so this listens to what comes out of it.
 */
test('runs the microphone through RNNoise when voice isolation is on', async () => {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), 'pulse-isolation-e2e-'));
  const application = await electron.launch({
    args: [path.resolve('.'), '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'],
    env: { ...process.env, NODE_ENV: 'test', PULSE_TEST_USER_DATA: dataDir },
  });

  try {
    const window = await application.firstWindow();
    const warnings: string[] = [];
    window.on('console', (message) => {
      if (message.type() === 'warning' || message.type() === 'error') warnings.push(message.text());
    });

    await window.evaluate(() => {
      localStorage.setItem('pulse-room:settings:v1', JSON.stringify({ voiceIsolation: true }));
      const store = {
        modules: [] as string[],
        failures: [] as string[],
        nodes: [] as string[],
        loudest: {} as Record<string, number>,
        // What is actually sent, ear by ear.
        sent: { left: 0, right: 0 },
      };
      (window as any).isolationProbe = store;
      const createDestination = AudioContext.prototype.createMediaStreamDestination;
      AudioContext.prototype.createMediaStreamDestination = function () {
        const destination = createDestination.call(this);
        const listener = new AudioContext();
        const split = listener.createChannelSplitter(2);
        listener.createMediaStreamSource(destination.stream).connect(split);
        const ears = [listener.createAnalyser(), listener.createAnalyser()] as const;
        split.connect(ears[0], 0);
        split.connect(ears[1], 1);
        const samples = new Float32Array(ears[0].fftSize);
        const level = (ear: AnalyserNode) => {
          ear.getFloatTimeDomainData(samples);
          return Math.sqrt(samples.reduce((sum, sample) => sum + sample * sample, 0) / samples.length);
        };
        setInterval(() => {
          store.sent.left = Math.max(store.sent.left, level(ears[0]));
          store.sent.right = Math.max(store.sent.right, level(ears[1]));
        }, 50);
        return destination;
      };
      const originalAddModule = AudioWorklet.prototype.addModule;
      AudioWorklet.prototype.addModule = async function (url: string, options?: WorkletOptions) {
        store.modules.push(String(url).split('/').pop() ?? '');
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
          store.nodes.push(name);
          // Listens to what this node puts out, as loud as it has been.
          const analyser = context.createAnalyser();
          const samples = new Float32Array(analyser.fftSize);
          this.connect(analyser);
          setInterval(() => {
            analyser.getFloatTimeDomainData(samples);
            const level = Math.sqrt(
              samples.reduce((sum, sample) => sum + sample * sample, 0) / samples.length,
            );
            store.loudest[name] = Math.max(store.loudest[name] ?? 0, level);
          }, 50);
        }
      } as typeof AudioWorkletNode;
    });

    await window.getByRole('button', { name: 'Lounge' }).click();
    await expect(
      window.locator('.profile-strip').getByRole('button', { name: 'Mute microphone' }),
    ).toBeVisible();

    await expect
      .poll(async () => window.evaluate(() => (window as any).isolationProbe))
      .toEqual({
        modules: expect.arrayContaining([
          expect.stringMatching(/^workletProcessor.*\.js$/),
          expect.stringMatching(/^noise-gate-processor.*\.js$/),
        ]),
        failures: [],
        nodes: ['@sapphi-red/web-noise-suppressor/rnnoise', 'noise-gate'],
        loudest: expect.anything(),
        sent: expect.anything(),
      });
    // The fake microphone's tone comes out of the network, not silence.
    await expect
      .poll(async () =>
        window.evaluate(
          () => (window as any).isolationProbe.loudest['@sapphi-red/web-noise-suppressor/rnnoise'] ?? 0,
        ),
      )
      .toBeGreaterThan(0.01);
    // RNNoise writes only its first channel. What leaves this machine has the
    // voice in both ears, not in the left one and silence in the right.
    await expect
      .poll(async () => window.evaluate(() => (window as any).isolationProbe.sent.right))
      .toBeGreaterThan(0.01);
    const sent = await window.evaluate(() => (window as any).isolationProbe.sent);
    expect(sent.right).toBeCloseTo(sent.left, 1);
    expect(warnings.filter((text) => /isolation|noise gate|processing/i.test(text))).toEqual([]);
  } finally {
    await application.close();
    await rm(dataDir, { recursive: true, force: true });
  }
});
