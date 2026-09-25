import type { MicrophoneOptions } from '../../domain/conference';
// The worklet has to stay a real file: addModule rejects the inlined data URL
// that Vite would otherwise produce for a small asset.
import noiseGateProcessorUrl from './noise-gate-processor.js?url&no-inline';

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

/** What the microphone chain says about itself, on the audio thread's clock. */
export type MicrophoneReport =
  | { type: 'speaking'; value: boolean }
  | { type: 'level'; value: number };

/** How loud this microphone is, for the meter beside your own name. */
export type LevelListener = (level: number) => void;

export class MicrophoneTrackFactory {
  public async create(
    options: MicrophoneOptions,
    onSpeaking?: SpeakingListener,
    onLevel?: LevelListener,
  ): Promise<ProcessedMicrophoneTrack> {
    const inputStream = await this.captureInput(options);

    try {
      return await this.process(inputStream, options, onSpeaking, onLevel);
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
    onLevel?: LevelListener,
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

    // The gate, the gain and the limiter are one pass on the audio thread. As
    // separate nodes the limiter alone was a DynamicsCompressorNode, which
    // holds the signal back about six milliseconds so it can see a peak
    // coming, and spends that on every syllable whether or not one does.
    const gate = await this.createNoiseGate(context, options);
    if (gate && (onSpeaking || onLevel)) {
      gate.port.onmessage = (event: MessageEvent<MicrophoneReport>) => {
        const report = event.data;
        if (report?.type === 'speaking') onSpeaking?.(report.value === true);
        else if (report?.type === 'level') onLevel?.(report.value);
      };
    }
    const fallbackGain = gate ? undefined : context.createGain();
    const fallbackLimiter = gate ? undefined : context.createDynamicsCompressor();

    if (gate) {
      source.connect(highPass).connect(gate).connect(output);
    } else if (fallbackGain && fallbackLimiter) {
      fallbackGain.gain.value = this.boundedGain(options.gain);
      fallbackLimiter.threshold.value = -3;
      fallbackLimiter.knee.value = 3;
      fallbackLimiter.ratio.value = 20;
      fallbackLimiter.attack.value = 0.003;
      fallbackLimiter.release.value = 0.12;
      source.connect(highPass).connect(fallbackGain).connect(fallbackLimiter).connect(output);
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
        // A graph that is going away is not talking, whatever it said last.
        onSpeaking?.(false);
        onLevel?.(0);
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
      noiseSuppression: options.noiseSuppression,
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
