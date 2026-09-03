import type { MicrophoneOptions } from '../../domain/conference';

export interface ProcessedMicrophoneTrack {
  track: MediaStreamTrack;
  dispose(): Promise<void>;
}

export class MicrophoneTrackFactory {
  public async create(options: MicrophoneOptions): Promise<ProcessedMicrophoneTrack> {
    const inputStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        deviceId: options.deviceId ? { exact: options.deviceId } : undefined,
        channelCount: 1,
        sampleRate: 48_000,
        echoCancellation: options.echoCancellation,
        noiseSuppression: options.noiseSuppression,
        autoGainControl: options.autoGainControl,
      },
    });

    const context = new AudioContext({ sampleRate: 48_000 });
    const source = context.createMediaStreamSource(inputStream);
    const gain = context.createGain();
    const limiter = context.createDynamicsCompressor();
    const output = context.createMediaStreamDestination();

    gain.gain.value = Math.min(1.5, Math.max(0, options.gain));
    limiter.threshold.value = -3;
    limiter.knee.value = 3;
    limiter.ratio.value = 20;
    limiter.attack.value = 0.003;
    limiter.release.value = 0.12;

    source.connect(gain).connect(limiter).connect(output);
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
}
