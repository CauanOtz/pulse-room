/**
 * The gate the audio thread runs. It is written as a worklet module, and its
 * decision is exported on its own so the amount of room it removes can be
 * measured without a browser.
 */
export declare class NoiseGate {
  constructor(rate: number);
  /** The level, in dBFS, below which the microphone is treated as silence. */
  setThreshold(decibels: number): void;
  /** Feeds one sample in and returns the gain that moment deserves. */
  advance(sample: number): number;
}
