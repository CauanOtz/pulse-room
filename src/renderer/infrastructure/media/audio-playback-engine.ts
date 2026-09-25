import { voiceLevels } from './voice-levels';

export interface PlaybackHandle {
  setVolume(percent: number): void;
  dispose(): void;
}

/**
 * Keeps a voice indicator steady across the tiny silences between syllables.
 * The threshold is intentionally low: this watches audio that already passed
 * through the sender's microphone processing, not raw room noise.
 */
export class VoiceActivityLatch {
  private speaking = false;
  private quietSince?: number;

  public constructor(
    private readonly threshold = 0.006,
    private readonly releaseDelayMs = 320,
  ) {}

  public sample(level: number, now: number): boolean {
    if (level >= this.threshold) {
      this.quietSince = undefined;
      this.speaking = true;
      return true;
    }

    if (!this.speaking) return false;
    this.quietSince ??= now;
    if (now - this.quietSince >= this.releaseDelayMs) {
      this.speaking = false;
      this.quietSince = undefined;
    }
    return this.speaking;
  }
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
  private latencyHint: AudioContextLatencyCategory | number = 0;

  public attach(
    stream: MediaStream,
    onSpeakingChange?: (speaking: boolean) => void,
    /** Whose voice this is, so its level can be drawn beside their name. */
    participantId?: string,
  ): PlaybackHandle | undefined {
    if (stream.getAudioTracks().length === 0) return undefined;

    try {
      const context = this.ensureContext();
      if (context.state === 'suspended') void context.resume();

      const source = context.createMediaStreamSource(stream);
      const gain = context.createGain();
      const analyser = onSpeakingChange ? context.createAnalyser() : undefined;
      if (analyser) {
        analyser.fftSize = 512;
        analyser.smoothingTimeConstant = 0.55;
        source.connect(analyser).connect(gain).connect(context.destination);
      } else {
        source.connect(gain).connect(context.destination);
      }

      const samples = analyser ? new Float32Array(analyser.fftSize) : undefined;
      const latch = analyser ? new VoiceActivityLatch() : undefined;
      let lastSpeaking = false;
      const timer = analyser
        ? window.setInterval(() => {
            analyser.getFloatTimeDomainData(samples!);
            let energy = 0;
            for (const sample of samples!) energy += sample * sample;
            const level = Math.sqrt(energy / samples!.length);
            // The same measurement, kept rather than discarded: it is what
            // the meter beside this person's name is drawn from.
            if (participantId) voiceLevels.report(participantId, level);
            const speaking = latch!.sample(level, performance.now());
            if (speaking === lastSpeaking) return;
            lastSpeaking = speaking;
            onSpeakingChange?.(speaking);
          }, 80)
        : undefined;

      return {
        setVolume: (percent) => {
          gain.gain.value = Math.max(0, percent) / 100;
        },
        dispose: () => {
          if (timer !== undefined) window.clearInterval(timer);
          if (participantId) voiceLevels.forget(participantId);
          if (lastSpeaking) onSpeakingChange?.(false);
          source.disconnect();
          analyser?.disconnect();
          gain.disconnect();
        },
      };
    } catch {
      // The caller falls back to the media element's own playback.
      return undefined;
    }
  }

  /**
   * How much slack the output buffer may keep. It is read when the graph is
   * built, so a change takes hold on the next call rather than interrupting
   * this one: rebuilding the context under a live room would drop its sound.
   */
  public useLatency(hint: AudioContextLatencyCategory | number): void {
    this.latencyHint = hint;
  }

  public async useOutputDevice(deviceId?: string): Promise<void> {
    this.sinkId = deviceId;
    await this.applySink();
  }

  private ensureContext(): AudioContext {
    if (!this.context || this.context.state === 'closed') {
      // Everything a voice waits in on this machine is delay the talker hears
      // back, and this buffer was the largest of those by a wide margin.
      this.context = new AudioContext({ latencyHint: this.latencyHint });
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
