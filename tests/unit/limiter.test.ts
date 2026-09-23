import { beforeAll, describe, expect, it, vi } from 'vitest';

const rate = 48_000;

let Limiter: typeof import('../../src/renderer/infrastructure/media/noise-gate-processor').Limiter;
let clamp: typeof import('../../src/renderer/infrastructure/media/noise-gate-processor').clamp;

beforeAll(async () => {
  vi.stubGlobal('AudioWorkletProcessor', class {});
  vi.stubGlobal('registerProcessor', () => undefined);
  vi.stubGlobal('sampleRate', rate);
  ({ Limiter, clamp } = await import('../../src/renderer/infrastructure/media/noise-gate-processor'));
});

const decibels = (value: number) => 20 * Math.log10(Math.max(value, 1e-12));

/** A second of a steady tone at the amplitude asked for. */
const tone = (amplitude: number, seconds = 1) =>
  Float32Array.from({ length: Math.round(rate * seconds) }, (_, index) =>
    amplitude === 0 ? 0 : amplitude * Math.sin((2 * Math.PI * 220 * index) / rate),
  );

function through(signal: Float32Array): Float32Array {
  const limiter = new Limiter(rate);
  const out = new Float32Array(signal.length);
  for (let index = 0; index < signal.length; index += 1) {
    out[index] = clamp(signal[index] * limiter.advance(signal[index]));
  }
  return out;
}

const peak = (samples: Float32Array) => samples.reduce((top, value) => Math.max(top, Math.abs(value)), 0);

/** Where the whole signal settles once the limiter has caught up with it. */
const settledPeak = (samples: Float32Array) => peak(samples.subarray(Math.round(rate * 0.05)));

describe('Limiter', () => {
  it('leaves a voice that was never near the roof alone', () => {
    const quiet = tone(0.2);

    const out = through(quiet);

    expect(peak(out)).toBeCloseTo(0.2, 3);
  });

  it('holds a signal driven well past the roof under it', () => {
    // The gain stage can lift a quiet microphone by half again, which is how a
    // loud moment arrives above full scale in the first place.
    const shouting = tone(1.8);

    const out = through(shouting);

    // -1 dBFS, with the room a first uncaught peak needs before it is pulled.
    expect(decibels(settledPeak(out))).toBeLessThan(-0.9);
  });

  it('never lets a sample leave outside the range one can hold', () => {
    const impossible = tone(6);

    const out = through(impossible);

    expect(peak(out)).toBeLessThanOrEqual(1);
  });

  it('catches a sudden peak within a millisecond of it arriving', () => {
    const signal = new Float32Array(rate);
    signal.set(tone(0.1, 0.5));
    // A door slamming into an open microphone, halfway through a quiet moment.
    for (let index = rate / 2; index < rate; index += 1) {
      signal[index] = 2 * Math.sin((2 * Math.PI * 220 * index) / rate);
    }

    const out = through(signal);
    const afterTheBang = out.subarray(rate / 2 + Math.round(rate * 0.001));

    expect(decibels(peak(afterTheBang))).toBeLessThan(-0.9);
  });

  it('lets the level back up rather than holding the room down', () => {
    const signal = new Float32Array(rate * 2);
    signal.set(tone(3, 0.2));
    signal.set(tone(0.3, 1.5), Math.round(rate * 0.4));

    const out = through(signal);
    // A second after the loud moment, a normal voice is its own size again.
    const later = out.subarray(Math.round(rate * 1.4), Math.round(rate * 1.8));

    expect(peak(later)).toBeGreaterThan(0.28);
  });

  it('adds no delay of its own, which is the whole reason it is here', () => {
    const signal = tone(0.2);

    const out = through(signal);

    // The first sample out is the first sample in: nothing is held back to
    // look at what comes next.
    expect(out[0]).toBeCloseTo(signal[0], 6);
    expect(out[1]).toBeCloseTo(signal[1], 6);
  });
});
