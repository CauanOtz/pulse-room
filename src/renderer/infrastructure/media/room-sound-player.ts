export type RoomSound = 'join' | 'leave' | 'mute' | 'unmute' | 'live-start' | 'live-stop';

interface Cue {
  notes: number[];
  /** Seconds between the start of one note and the next. */
  step: number;
  hold: number;
  peak: number;
}

const cues: Record<RoomSound, Cue> = {
  join: { notes: [587.33, 880], step: 0.09, hold: 0.16, peak: 0.13 },
  leave: { notes: [880, 587.33], step: 0.09, hold: 0.16, peak: 0.13 },
  // Muting is a frequent, private act, so its cue is quieter and quicker than
  // the ones that announce somebody to the whole room.
  mute: { notes: [660, 440], step: 0.055, hold: 0.1, peak: 0.075 },
  unmute: { notes: [440, 660], step: 0.055, hold: 0.1, peak: 0.075 },
  'live-start': { notes: [523.25, 659.25, 784], step: 0.07, hold: 0.14, peak: 0.1 },
  'live-stop': { notes: [784, 659.25, 523.25], step: 0.07, hold: 0.14, peak: 0.1 },
};

/**
 * Plays the short cues that mark what just happened in the room.
 * The notes are synthesised, so the application ships no audio files and the
 * cue never waits on a decoder.
 */
export class RoomSoundPlayer {
  private context?: AudioContext;

  public play(sound: RoomSound): void {
    try {
      const context = this.ensureContext();
      if (context.state === 'suspended') void context.resume();
      const cue = cues[sound];

      cue.notes.forEach((frequency, index) => {
        const startsAt = context.currentTime + index * cue.step;
        const oscillator = context.createOscillator();
        const envelope = context.createGain();

        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(frequency, startsAt);
        envelope.gain.setValueAtTime(0.0001, startsAt);
        envelope.gain.exponentialRampToValueAtTime(cue.peak, startsAt + 0.012);
        envelope.gain.exponentialRampToValueAtTime(0.0001, startsAt + cue.hold);

        oscillator.connect(envelope).connect(context.destination);
        oscillator.start(startsAt);
        oscillator.stop(startsAt + cue.hold + 0.02);
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
