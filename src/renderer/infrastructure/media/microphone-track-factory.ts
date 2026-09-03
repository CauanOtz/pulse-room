import type { MicrophoneOptions } from '../../domain/conference';
// The worklet has to stay a real file: addModule rejects the inlined data URL
// that Vite would otherwise produce for a small asset.
import noiseGateProcessorUrl from './noise-gate-processor.js?url&no-inline';

export interface ProcessedMicrophoneTrack {
  track: MediaStreamTrack;
  dispose(): Promise<void>;
}

export class MicrophoneTrackFactory {
  public async create(options: MicrophoneOptions): Promise<ProcessedMicrophoneTrack> {
    const inputStream = await this.captureInput(options);

    const context = new AudioContext({ sampleRate: 48_000 });
    if (context.state === 'suspended') await context.resume();

    const source = context.createMediaStreamSource(inputStream);
    // Desk rumble and handling noise live below speech and only waste bitrate.
    const highPass = context.createBiquadFilter();
    const gain = context.createGain();
    const limiter = context.createDynamicsCompressor();
    const output = context.createMediaStreamDestination();

    highPass.type = 'highpass';
    highPass.frequency.value = 90;
    gain.gain.value = Math.min(1.5, Math.max(0, options.gain));
    limiter.threshold.value = -3;
    limiter.knee.value = 3;
    limiter.ratio.value = 20;
    limiter.attack.value = 0.003;
    limiter.release.value = 0.12;

    const gate = await this.createNoiseGate(context, options);
    if (gate) {
      source.connect(highPass).connect(gate).connect(gain).connect(limiter).connect(output);
    } else {
      source.connect(highPass).connect(gain).connect(limiter).connect(output);
    }

    const processedTrack = output.stream.getAudioTracks()[0];
    if (!processedTrack) {
      inputStream.getTracks().forEach((track) => track.stop());
      await context.close();
      throw new Error('The microphone did not provide an audio track.');
    }

    return {
      track: processedTrack,
      dispose: async () => {
        inputStream.getTracks().forEach((track) => track.stop());
        processedTrack.stop();
        if (context.state !== 'closed') await context.close();
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
