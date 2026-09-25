/**
 * The microphone chain, running on the audio thread.
 *
 * Three things happen to a voice on its way out, and they happen here together
 * rather than as three nodes: the gate, the gain and the limiter.
 *
 * The gate exists because browser noise suppression removes steady broadband
 * noise but leaves fans, keystrokes and room tone audible between words. It
 * follows the energy of the signal rather than single samples; deciding on one
 * sample at a time reads the peaks of a hiss as speech, which held the gate
 * open through the quiet of a room and made it do almost nothing.
 *
 * What closes it is time, not a second quieter threshold. A level to open and
 * a lower one to close is the usual arrangement and it has a trap in it: a
 * room whose own sound happens to sit between the two keeps the gate open for
 * the rest of the call once a first word has opened it, and most rooms sit
 * there. One threshold and a fifth of a second of patience bridges the gaps
 * inside a sentence without ever latching.
 *
 * The limiter is here rather than in a DynamicsCompressorNode because that node
 * buys its cleanliness with a fixed look-ahead of about six milliseconds, and
 * it spends that on every syllable whether or not anything needed limiting.
 * This one reacts after the peak instead of before it, which a listener cannot
 * hear on a voice and a talker can hear as a shorter round trip.
 */

/** Closed is quiet, not silent: a dead void sounds like the call dropped. */
const closedGainDb = -28;
const levelSeconds = 0.008;
const attackSeconds = 0.004;
const releaseSeconds = 0.12;
const holdSeconds = 0.2;

/** Where the limiter holds the loudest moments, short of the digital roof. */
const ceilingDb = -1;
/** How long the limiter remembers a peak when nothing louder follows it. */
const peakMemorySeconds = 0.15;
const limiterReleaseSeconds = 0.15;

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
  }

  /** The gain this moment of the signal deserves, between the floor and one. */
  advance(sample) {
    this.power += (sample * sample - this.power) * this.levelCoefficient;
    const level = Math.sqrt(this.power);

    if (level > this.openAt) {
      this.open = true;
      this.hold = this.holdSamples;
    } else if (this.hold > 0) {
      // The gap between two syllables and the tail of a word both live here,
      // and both are worth waiting out.
      this.hold -= 1;
    } else {
      this.open = false;
    }

    const wanted = this.open ? 1 : this.closedGain;
    this.gain += (wanted - this.gain) * (wanted > this.gain ? this.attack : this.release);
    return this.gain;
  }
}

/**
 * Keeps the loudest moments under the roof without looking ahead.
 *
 * Two things make it work without a delay line. It follows an envelope of the
 * peaks rather than the sample in front of it, because a wave passes through
 * zero on the way to its next crest and a limiter that believed those zeroes
 * would let go of the signal and grab it again at the tone's own frequency.
 * And it takes hold the instant a peak arrives rather than easing in, because
 * easing in over even half a millisecond is long enough for a door slamming
 * into an open microphone to reach the roof and be clipped there.
 *
 * Letting go is the slow half: a sixth of a second, which on a voice is
 * inaudible. What the whole arrangement buys is that nothing in the chain
 * holds the signal back in order to see what is coming.
 */
export class Limiter {
  constructor(rate) {
    this.ceiling = decibelsToGain(ceilingDb);
    this.release = smoothing(limiterReleaseSeconds, rate);
    this.memory = Math.exp(-1 / (rate * peakMemorySeconds));
    this.peak = 0;
    this.reduction = 1;
  }

  /** The gain to apply to this sample so the output stays under the roof. */
  advance(sample) {
    const magnitude = Math.abs(sample);
    this.peak = magnitude > this.peak ? magnitude : this.peak * this.memory;
    const wanted = this.peak > this.ceiling ? this.ceiling / this.peak : 1;
    this.reduction =
      wanted < this.reduction ? wanted : this.reduction + (wanted - this.reduction) * this.release;
    return this.reduction;
  }
}

/** Nothing leaves the chain outside the range a sample is allowed to hold. */
export const clamp = (sample) => (sample > 1 ? 1 : sample < -1 ? -1 : sample);

class NoiseGateProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: 'threshold', defaultValue: -50, minValue: -100, maxValue: 0, automationRate: 'k-rate' },
      { name: 'enabled', defaultValue: 1, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
      { name: 'gain', defaultValue: 1, minValue: 0, maxValue: 4, automationRate: 'k-rate' },
    ];
  }

  constructor() {
    super();
    this.gate = new NoiseGate(sampleRate);
    this.limiter = new Limiter(sampleRate);
    this.threshold = Number.NaN;
    this.announced = false;
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0];
    const output = outputs[0];
    if (!input || input.length === 0) return true;

    const enabled = parameters.enabled[0] >= 0.5;
    const threshold = parameters.threshold[0];
    const gain = parameters.gain[0];
    if (threshold !== this.threshold) {
      this.threshold = threshold;
      this.gate.setThreshold(threshold);
    }

    const first = input[0];
    if (!first) return true;

    for (let index = 0; index < first.length; index += 1) {
      // The gate runs whether or not its gain is wanted, because whether
      // somebody is talking is worth knowing even when nothing is being
      // removed from what they say.
      const decision = this.gate.advance(first[index]);
      const gateGain = enabled ? decision : 1;
      const lifted = first[index] * gateGain * gain;
      const held = this.limiter.advance(lifted);
      for (let channel = 0; channel < input.length; channel += 1) {
        const samples = input[channel];
        const target = output[channel];
        if (!samples || !target) continue;
        target[index] = clamp(samples[index] * gateGain * gain * held);
      }
    }

    // Whether this microphone is talking, the instant it starts. The room's
    // own answer to that question comes from the server, which is a round trip
    // and an interval away, and your own face should not wait for it.
    if (this.gate.open !== this.announced) {
      this.announced = this.gate.open;
      this.port.postMessage(this.announced);
    }

    return true;
  }
}

registerProcessor('noise-gate', NoiseGateProcessor);
