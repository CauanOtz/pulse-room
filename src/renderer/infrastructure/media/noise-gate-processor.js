/**
 * Noise gate for the microphone, running on the audio thread.
 *
 * Browser noise suppression removes steady broadband noise but leaves fans,
 * keystrokes and room tone audible between words. The gate closes while the
 * room is only making its usual sound and opens when speech arrives.
 *
 * It follows the energy of the signal rather than single samples. Deciding on
 * one sample at a time reads the peaks of a hiss as speech, which held the gate
 * open through the quiet of a room and made it do almost nothing.
 */

/** How far below the opening level the room must fall before it closes again. */
const hysteresisDb = 6;
/** Closed is quiet, not silent: a dead void sounds like the call dropped. */
const closedGainDb = -28;
const levelSeconds = 0.008;
const attackSeconds = 0.004;
const releaseSeconds = 0.12;
const holdSeconds = 0.2;

const decibelsToGain = (decibels) => 10 ** (decibels / 20);
/** One-pole coefficient that reaches most of the way in the time given. */
const smoothing = (seconds, rate) => 1 - Math.exp(-1 / (rate * seconds));

export class NoiseGate {
  constructor(rate) {
    this.rate = rate;
    this.power = 0;
    this.gain = 0;
    this.hold = 0;
    this.open = false;
    this.levelCoefficient = smoothing(levelSeconds, rate);
    this.attack = smoothing(attackSeconds, rate);
    this.release = smoothing(releaseSeconds, rate);
    this.holdSamples = Math.round(rate * holdSeconds);
    this.closedGain = decibelsToGain(closedGainDb);
    this.setThreshold(-50);
  }

  setThreshold(decibels) {
    this.openAt = decibelsToGain(decibels);
    this.closeAt = decibelsToGain(decibels - hysteresisDb);
  }

  /** The gain this moment of the signal deserves, between the floor and one. */
  advance(sample) {
    this.power += (sample * sample - this.power) * this.levelCoefficient;
    const level = Math.sqrt(this.power);

    if (level > this.openAt) {
      this.open = true;
      this.hold = this.holdSamples;
    } else if (this.hold > 0) {
      this.hold -= 1;
    } else if (level < this.closeAt) {
      this.open = false;
    }

    const wanted = this.open ? 1 : this.closedGain;
    this.gain += (wanted - this.gain) * (wanted > this.gain ? this.attack : this.release);
    return this.gain;
  }
}

class NoiseGateProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: 'threshold', defaultValue: -50, minValue: -100, maxValue: 0, automationRate: 'k-rate' },
      { name: 'enabled', defaultValue: 1, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
    ];
  }

  constructor() {
    super();
    this.gate = new NoiseGate(sampleRate);
    this.threshold = Number.NaN;
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0];
    const output = outputs[0];
    if (!input || input.length === 0) return true;

    const enabled = parameters.enabled[0] >= 0.5;
    const threshold = parameters.threshold[0];
    if (threshold !== this.threshold) {
      this.threshold = threshold;
      this.gate.setThreshold(threshold);
    }

    const first = input[0];
    if (!first) return true;

    for (let index = 0; index < first.length; index += 1) {
      // One decision for the microphone, applied to whatever it publishes.
      const gain = this.gate.advance(first[index]);
      for (let channel = 0; channel < input.length; channel += 1) {
        const samples = input[channel];
        const target = output[channel];
        if (!samples || !target) continue;
        target[index] = enabled ? samples[index] * gain : samples[index];
      }
    }

    return true;
  }
}

registerProcessor('noise-gate', NoiseGateProcessor);
