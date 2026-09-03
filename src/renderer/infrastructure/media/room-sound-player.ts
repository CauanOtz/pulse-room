export type RoomSound = 'join' | 'leave';

const melodies: Record<RoomSound, number[]> = {
  join: [587.33, 880],
  leave: [880, 587.33],
};

/**
 * Plays the short two-note cues that tell a room somebody arrived or left.
 * The notes are synthesised, so the application ships no audio files and the
 * cue never waits on a decoder.
 */
export class RoomSoundPlayer {
  private context?: AudioContext;

  public play(sound: RoomSound): void {
    try {
      const context = this.ensureContext();
      if (context.state === 'suspended') void context.resume();

      melodies[sound].forEach((frequency, index) => {
        const startsAt = context.currentTime + index * 0.09;
        const oscillator = context.createOscillator();
        const envelope = context.createGain();

        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(frequency, startsAt);
        envelope.gain.setValueAtTime(0.0001, startsAt);
        envelope.gain.exponentialRampToValueAtTime(0.13, startsAt + 0.012);
        envelope.gain.exponentialRampToValueAtTime(0.0001, startsAt + 0.16);

        oscillator.connect(envelope).connect(context.destination);
        oscillator.start(startsAt);
        oscillator.stop(startsAt + 0.18);
      });
    } catch {
      // A machine without an audio engine simply stays quiet.
    }
  }

  public async dispose(): Promise<void> {
    const context = this.context;
    this.context = undefined;
    if (context && context.state !== 'closed') await context.close();
  }

  private ensureContext(): AudioContext {
    if (!this.context || this.context.state === 'closed') this.context = new AudioContext();
    return this.context;
  }
}
