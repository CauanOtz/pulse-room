export interface PlaybackHandle {
  setVolume(percent: number): void;
  dispose(): void;
}

/**
 * Plays incoming audio through one shared Web Audio graph.
 *
 * A media element cannot be turned up past its own recording level, and a quiet
 * game or a quiet friend often needs more than that. Routing playback through a
 * gain node allows a boost above 100%, and keeps every output on one device.
 */
export class AudioPlaybackEngine {
  private context?: AudioContext;
  private sinkId?: string;

  public attach(stream: MediaStream): PlaybackHandle | undefined {
    if (stream.getAudioTracks().length === 0) return undefined;

    try {
      const context = this.ensureContext();
      if (context.state === 'suspended') void context.resume();

      const source = context.createMediaStreamSource(stream);
      const gain = context.createGain();
      source.connect(gain).connect(context.destination);

      return {
        setVolume: (percent) => {
          gain.gain.value = Math.max(0, percent) / 100;
        },
        dispose: () => {
          source.disconnect();
          gain.disconnect();
        },
      };
    } catch {
      // The caller falls back to the media element's own playback.
      return undefined;
    }
  }

  public async useOutputDevice(deviceId?: string): Promise<void> {
    this.sinkId = deviceId;
    await this.applySink();
  }

  private ensureContext(): AudioContext {
    if (!this.context || this.context.state === 'closed') {
      this.context = new AudioContext();
      void this.applySink();
    }
    return this.context;
  }

  private async applySink(): Promise<void> {
    const context = this.context as (AudioContext & { setSinkId?(id: string): Promise<void> }) | undefined;
    if (!context?.setSinkId || !this.sinkId) return;
    await context.setSinkId(this.sinkId).catch(() => undefined);
  }
}

export const audioPlayback = new AudioPlaybackEngine();
