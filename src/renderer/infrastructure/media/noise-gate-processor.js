/**
 * Noise gate for the microphone, running on the audio thread.
 *
 * Browser noise suppression removes steady broadband noise but leaves fans,
 * keystrokes, and room tone audible between words. The gate closes while the
 * signal sits below the threshold and opens quickly when speech arrives, with a
 * hold time so natural pauses inside a sentence do not chop the voice.
 */
class NoiseGateProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: 'threshold', defaultValue: -50, minValue: -100, maxValue: 0, automationRate: 'k-rate' },
      { name: 'enabled', defaultValue: 1, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
    ];
  }

  constructor() {
    super();
    this.envelope = 0;
    this.holdCounter = 0;
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0];
    const output = outputs[0];
    if (!input || input.length === 0) return true;

    const enabled = parameters.enabled[0] >= 0.5;
    const threshold = 10 ** (parameters.threshold[0] / 20);
    const open = threshold * 1.6;
    const attack = 0.01;
    const release = 0.0006;
    const holdFrames = Math.round(sampleRate * 0.25);

    for (let channel = 0; channel < input.length; channel += 1) {
      const samples = input[channel];
      const target = output[channel];
      if (!samples || !target) continue;

      for (let index = 0; index < samples.length; index += 1) {
        const sample = samples[index];

        if (channel === 0) {
          const level = Math.abs(sample);
          if (level > open) {
            this.holdCounter = holdFrames;
          } else if (this.holdCounter > 0) {
            this.holdCounter -= 1;
          }

          const wanted = level > threshold || this.holdCounter > 0 ? 1 : 0;
          const coefficient = wanted > this.envelope ? attack : release;
          this.envelope += (wanted - this.envelope) * coefficient;
        }

        target[index] = enabled ? sample * this.envelope : sample;
      }
    }

    return true;
  }
}

registerProcessor('noise-gate', NoiseGateProcessor);
