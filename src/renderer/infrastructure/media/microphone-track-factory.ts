import type { MicrophoneOptions } from '../../domain/conference';
// The worklet has to stay a real file: addModule rejects the inlined data URL
// that Vite would otherwise produce for a small asset.
import noiseGateProcessorUrl from './noise-gate-processor.js?url&no-inline';
import type { RnnoiseWorkletNode } from '@sapphi-red/web-noise-suppressor';
import rnnoiseProcessorUrl from '@sapphi-red/web-noise-suppressor/rnnoiseWorklet.js?url&no-inline';

/**
 * The bytes of an inlined asset. Decoded here rather than fetched, because the
 * page's content policy rightly refuses to fetch data: URLs.
 */
function fromDataUrl(url: string): ArrayBuffer {
  const binary = atob(url.slice(url.indexOf(',') + 1));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes.buffer;
}

let rnnoise: Promise<{ Node: typeof RnnoiseWorkletNode; wasmBinary: ArrayBuffer }> | undefined;

/**
 * The network and its weights, loaded the first time somebody turns it on and
 * kept for the rest of the run. The weights are inlined rather than fetched:
 * the packaged app is served over file://, where fetch cannot read a file.
 * Every runtime this ships in has SIMD.
 */
function loadRnnoise() {
  rnnoise ??= Promise.all([
    import('@sapphi-red/web-noise-suppressor'),
    import('@sapphi-red/web-noise-suppressor/rnnoise_simd.wasm?url&inline'),
  ]).then(([library, weights]) => ({
    Node: library.RnnoiseWorkletNode,
    wasmBinary: fromDataUrl(weights.default),
  }));
  // A failed load is tried again next time rather than remembered.
  rnnoise.catch(() => (rnnoise = undefined));
  return rnnoise;
}

/**
 * Makes a node take a single channel. 'speakers' mixes a stereo input down to
 * it; 'discrete' keeps the first channel, which is the right answer after a
 * node that only ever writes there.
 */
function mono<T extends AudioNode>(node: T, interpretation: ChannelInterpretation): T {
  node.channelCount = 1;
  node.channelCountMode = 'explicit';
  node.channelInterpretation = interpretation;
  return node;
}

export interface ProcessedMicrophoneTrack {
  track: MediaStreamTrack;
  processed: boolean;
  /** Retunes the live graph, so a settings change never interrupts the call. */
  apply(options: MicrophoneOptions): void;
  dispose(): Promise<void>;
}

/**
 * Told the moment this microphone starts and stops carrying a voice.
 *
 * Absent when the processing graph could not be built, in which case nobody on
 * this machine knows, and the room's own answer is the only one there is.
 */
export type SpeakingListener = (speaking: boolean) => void;

export class MicrophoneTrackFactory {
  public async create(
    options: MicrophoneOptions,
    onSpeaking?: SpeakingListener,
  ): Promise<ProcessedMicrophoneTrack> {
    const inputStream = await this.captureInput(options);

    try {
      return await this.process(inputStream, options, onSpeaking);
    } catch (error) {
      // Being heard matters more than being filtered: if the processing graph
      // cannot be built on this machine, publish the plain microphone.
      console.warn('Microphone processing is unavailable; using the raw input.', error);
      return this.rawTrack(inputStream);
    }
  }

  private async process(
    inputStream: MediaStream,
    options: MicrophoneOptions,
    onSpeaking?: SpeakingListener,
  ): Promise<ProcessedMicrophoneTrack> {
    const context = this.createContext(options.latencyHint);
    if (context.state === 'suspended') await context.resume();

    const source = context.createMediaStreamSource(inputStream);
    // Desk rumble and handling noise live below speech and only waste bitrate.
    // A biquad reads one sample at a time and costs the chain nothing.
    const highPass = context.createBiquadFilter();
    const output = context.createMediaStreamDestination();

    highPass.type = 'highpass';
    highPass.frequency.value = 90;

    // A voice is one channel, from the first node to the last. Asking the
    // device for mono is only a preference, so a stereo microphone is folded
    // down here. And a node that writes only its first channel, as RNNoise
    // does, would otherwise send a voice to one ear and silence to the other.
    // The destination is left as it was: it spreads that one channel to both.
    mono(highPass, 'speakers');

    // The gate, the gain and the limiter are one pass on the audio thread. As
    // separate nodes the limiter alone was a DynamicsCompressorNode, which
    // holds the signal back about six milliseconds so it can see a peak
    // coming, and spends that on every syllable whether or not one does.
    const isolation = options.voiceIsolation ? await this.createVoiceIsolation(context) : undefined;
    const gate = await this.createNoiseGate(context, options);
    if (gate && onSpeaking) {
      gate.port.onmessage = (event: MessageEvent<boolean>) => onSpeaking(event.data === true);
    }
    const fallbackGain = gate ? undefined : context.createGain();
    const fallbackLimiter = gate ? undefined : context.createDynamicsCompressor();

    // The network goes before the gate, so the gate judges a voice with the
    // room already taken out of it.
    const cleaned: AudioNode = isolation
      ? highPass.connect(isolation).connect(mono(context.createGain(), 'discrete'))
      : highPass;
    source.connect(highPass);
    if (gate) {
      cleaned.connect(gate).connect(output);
    } else if (fallbackGain && fallbackLimiter) {
      fallbackGain.gain.value = this.boundedGain(options.gain);
      fallbackLimiter.threshold.value = -3;
      fallbackLimiter.knee.value = 3;
      fallbackLimiter.ratio.value = 20;
      fallbackLimiter.attack.value = 0.003;
      fallbackLimiter.release.value = 0.12;
      cleaned.connect(fallbackGain).connect(fallbackLimiter).connect(output);
    }

    const processedTrack = output.stream.getAudioTracks()[0];
    if (!processedTrack) {
      await context.close();
      throw new Error('The audio engine did not produce a microphone track.');
    }

    const apply = (next: MicrophoneOptions) => {
      const wanted = this.boundedGain(next.gain);
      if (fallbackGain) fallbackGain.gain.value = wanted;
      gate?.parameters.get('gain')?.setValueAtTime(wanted, context.currentTime);
      gate?.parameters.get('threshold')?.setValueAtTime(next.noiseGateThreshold, context.currentTime);
      gate?.parameters.get('enabled')?.setValueAtTime(next.noiseSuppression ? 1 : 0, context.currentTime);
    };

    return {
      track: processedTrack,
      processed: true,
      apply,
      dispose: async () => {
        if (gate) gate.port.onmessage = null;
        isolation?.destroy();
        // A graph that is going away is not talking, whatever it said last.
        onSpeaking?.(false);
        inputStream.getTracks().forEach((track) => track.stop());
        processedTrack.stop();
        if (context.state !== 'closed') await context.close();
      },
    };
  }

  private boundedGain(gain: number): number {
    return Math.min(1.5, Math.max(0, gain));
  }

  /**
   * Not every sound card runs at 48 kHz, and asking for a rate the device
   * cannot serve makes the constructor throw instead of resampling.
   */
  private createContext(latencyHint: AudioContextLatencyCategory | number = 0): AudioContext {
    // Measured on Windows: 'interactive' is not the smallest buffer on offer,
    // it is the comfortable one. A plain zero asks for nothing at all, and got
    // 2.7 ms of capture buffer against the 10 ms 'interactive' settled for.
    try {
      return new AudioContext({ sampleRate: 48_000, latencyHint });
    } catch {
      return new AudioContext({ latencyHint });
    }
  }

  private rawTrack(inputStream: MediaStream): ProcessedMicrophoneTrack {
    const track = inputStream.getAudioTracks()[0];
    if (!track) {
      inputStream.getTracks().forEach((each) => each.stop());
      throw new Error('The microphone did not provide an audio track.');
    }

    return {
      track,
      processed: false,
      apply: () => undefined,
      dispose: async () => {
        inputStream.getTracks().forEach((each) => each.stop());
      },
    };
  }

  /**
   * A saved device can disappear between sessions, and failing the whole call
   * for it would leave the room silent, so the default microphone takes over.
   */
  private async captureInput(options: MicrophoneOptions): Promise<MediaStream> {
    const constraints: MediaTrackConstraints = {
      channelCount: 1,
      sampleRate: 48_000,
      echoCancellation: options.echoCancellation,
      // Two suppressors in a row each take a little of the voice with the
      // noise; with the network on, the browser's own is left out.
      noiseSuppression: options.noiseSuppression && !options.voiceIsolation,
      autoGainControl: options.autoGainControl,
    };

    if (options.deviceId) {
      try {
        return await navigator.mediaDevices.getUserMedia({
          audio: { ...constraints, deviceId: { exact: options.deviceId } },
        });
      } catch {
        // The chosen microphone is gone; fall through to the system default.
      }
    }

    return navigator.mediaDevices.getUserMedia({ audio: constraints });
  }

  /**
   * RNNoise, a small recurrent network trained to tell a voice from everything
   * else, run on the audio thread. It only works on 48 kHz audio, and a call
   * without it is still a call, so anything that goes wrong leaves it out.
   */
  private async createVoiceIsolation(context: AudioContext): Promise<RnnoiseWorkletNode | undefined> {
    if (!context.audioWorklet || context.sampleRate !== 48_000) return undefined;
    try {
      const [{ Node, wasmBinary }] = await Promise.all([
        loadRnnoise(),
        context.audioWorklet.addModule(rnnoiseProcessorUrl),
      ]);
      return new Node(context, { maxChannels: 1, wasmBinary });
    } catch (error) {
      console.warn('Voice isolation could not start.', error);
      return undefined;
    }
  }

  private async createNoiseGate(
    context: AudioContext,
    options: MicrophoneOptions,
  ): Promise<AudioWorkletNode | undefined> {
    if (!context.audioWorklet) return undefined;

    try {
      await context.audioWorklet.addModule(noiseGateProcessorUrl);
      const gate = new AudioWorkletNode(context, 'noise-gate');
      gate.parameters.get('gain')?.setValueAtTime(this.boundedGain(options.gain), context.currentTime);
      gate.parameters.get('threshold')?.setValueAtTime(options.noiseGateThreshold, context.currentTime);
      gate.parameters.get('enabled')?.setValueAtTime(options.noiseSuppression ? 1 : 0, context.currentTime);
      return gate;
    } catch (error) {
      // Without the worklet the browser's own suppression still applies.
      console.warn('The noise gate could not start.', error);
      return undefined;
    }
  }
}
