import { beforeAll, describe, expect, it, vi } from 'vitest';

const rate = 48_000;

// The worklet is a module the audio thread loads, so its globals have to exist
// before it is imported here.
let NoiseGate: typeof import('../../src/renderer/infrastructure/media/noise-gate-processor').NoiseGate;

beforeAll(async () => {
  vi.stubGlobal('AudioWorkletProcessor', class {});
  vi.stubGlobal('registerProcessor', () => undefined);
  vi.stubGlobal('sampleRate', rate);
  ({ NoiseGate } = await import('../../src/renderer/infrastructure/media/noise-gate-processor'));
});

const decibels = (value: number) => 20 * Math.log10(Math.max(value, 1e-12));

const loudness = (samples: Float32Array) =>
  decibels(Math.sqrt(samples.reduce((total, value) => total + value * value, 0) / samples.length));

/** Runs a signal through the gate and returns what the room would hear. */
function through(signal: Float32Array, threshold = -50): Float32Array {
  const gate = new NoiseGate(rate);
  gate.setThreshold(threshold);
  const out = new Float32Array(signal.length);
  for (let index = 0; index < signal.length; index += 1) out[index] = signal[index] * gate.advance(signal[index]);
  return out;
}

const seconds = 3;
const length = rate * seconds;

/** The sound of a room with a computer in it, near -50 dBFS. */
const roomTone = () =>
  Float32Array.from({ length }, () => (Math.random() * 2 - 1) * 0.004);

/** A voiced sound: a fundamental with a harmonic, faded in and out. */
function speaking(amplitude = 0.25): Float32Array {
  const out = new Float32Array(length);
  for (let index = 0; index < length; index += 1) {
    const time = index / rate;
    const shape = Math.min(1, index / (rate * 0.02)) * Math.min(1, (length - index) / (rate * 0.05));
    out[index] =
      amplitude *
      shape *
      (Math.sin(2 * Math.PI * 130 * time) * 0.6 + Math.sin(2 * Math.PI * 390 * time) * 0.3);
  }
  return out;
}

const mixed = (...tracks: Float32Array[]) => {
  const out = new Float32Array(length);
  for (const track of tracks) for (let index = 0; index < length; index += 1) out[index] += track[index];
  return out;
};

describe('NoiseGate', () => {
  it('takes the room down by more than twenty decibels when nobody is talking', () => {
    const room = roomTone();

    const quietened = loudness(room) - loudness(through(room));

    // Judging one sample at a time read the peaks of a hiss as speech and left
    // this at under two decibels, which is the whole complaint about the gate.
    expect(quietened).toBeGreaterThan(20);
  });

  it('leaves a voice alone', () => {
    const voice = mixed(roomTone(), speaking());

    expect(loudness(through(voice))).toBeCloseTo(loudness(voice), 1);
  });

  it('opens fast enough that the first word is not eaten', () => {
    const silence = new Float32Array(rate);
    const voice = speaking();
    const signal = mixed(new Float32Array(length));
    signal.set(silence, 0);
    signal.set(voice.subarray(0, length - rate), rate);

    const out = through(signal);
    const firstWord = out.subarray(rate, rate + Math.round(rate * 0.05));
    const asSpoken = signal.subarray(rate, rate + Math.round(rate * 0.05));

    // Within the first fifty milliseconds the gate is out of the way.
    expect(loudness(asSpoken) - loudness(firstWord)).toBeLessThan(6);
  });

  it('closes again in a room whose own sound sits near the threshold', () => {
    // The trap in the usual arrangement: a level to open and a lower one to
    // close leaves a band, and a room that hums inside that band holds the
    // gate open for the rest of the call once one word has opened it.
    const gate = new NoiseGate(rate);
    gate.setThreshold(-50);
    for (let index = 0; index < rate * 0.3; index += 1) gate.advance(0.25);

    // Room tone at about -53 dBFS: under the threshold, over where a second
    // quieter threshold would have been.
    let closedAfter: number | undefined;
    for (let index = 0; index < rate * 2; index += 1) {
      gate.advance((Math.random() * 2 - 1) * 0.004);
      if (closedAfter === undefined && !gate.open) closedAfter = (index / rate) * 1000;
    }

    expect(closedAfter).toBeDefined();
    // The hold is a fifth of a second, and the envelope takes a moment more.
    expect(closedAfter!).toBeLessThan(400);
  });

  it('holds through the gaps inside a sentence', () => {
    const gate = new NoiseGate(rate);
    gate.setThreshold(-50);
    for (let index = 0; index < rate * 0.3; index += 1) gate.advance(0.25);
    // A tenth of a second of nothing, the length of a breath between words.
    let gain = 1;
    for (let index = 0; index < rate * 0.1; index += 1) gain = gate.advance(0);

    expect(gain).toBeGreaterThan(0.9);
  });

  it('lets the strength decide how loud a room has to be to count', () => {
    const room = roomTone();

    // The slider sets the level below which the microphone is treated as
    // silence, so a stricter setting has to take more of the room away.
    const gentle = loudness(room) - loudness(through(room, -70));
    const strict = loudness(room) - loudness(through(room, -40));

    expect(gentle).toBeLessThan(6);
    expect(strict).toBeGreaterThan(gentle + 15);
  });
});
