/**
 * The microphone chain the audio thread runs. It is written as a worklet
 * module, and its decisions are exported on their own so what they do to a
 * signal can be measured without a browser.
 */
export declare class NoiseGate {
  constructor(rate: number);
  /** The level, in dBFS, below which the microphone is treated as silence. */
  setThreshold(decibels: number): void;
  /** Feeds one sample in and returns the gain that moment deserves. */
  advance(sample: number): number;
}

export declare class Limiter {
  constructor(rate: number);
  /** The gain to apply to this sample so the output stays under the roof. */
  advance(sample: number): number;
}

/** Nothing leaves the chain outside the range a sample is allowed to hold. */
export declare function clamp(sample: number): number;
