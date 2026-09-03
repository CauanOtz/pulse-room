export type ParticipantStreamKind = 'microphone' | 'screen';

/**
 * Keeps one MediaStream per participant and kind, stable for as long as its
 * tracks are.
 *
 * The conference gateway rebuilds its snapshot on every room event, including
 * the frequent active-speaker updates. Handing a brand new MediaStream to the
 * media elements on each of those rebuilds restarts playback, which shows up as
 * a flickering screen share and short gaps in the audio.
 *
 * When the tracks themselves change, as they do when somebody republishes a
 * microphone, the stream is replaced instead of edited: a media element already
 * attached to a stream does not reliably follow a track swapped inside it, and
 * the listener is left with silence.
 */
export class ParticipantStreamRegistry {
  private readonly streams = new Map<string, MediaStream>();

  public sync(
    participantId: string,
    kind: ParticipantStreamKind,
    tracks: MediaStreamTrack[],
  ): MediaStream | undefined {
    const key = this.keyOf(participantId, kind);

    if (tracks.length === 0) {
      this.streams.delete(key);
      return undefined;
    }

    const current = this.streams.get(key);
    if (current && this.holdsExactly(current, tracks)) return current;

    const stream = new MediaStream(tracks);
    this.streams.set(key, stream);
    return stream;
  }

  public forget(participantId: string): void {
    (['microphone', 'screen'] satisfies ParticipantStreamKind[]).forEach((kind) => {
      this.streams.delete(this.keyOf(participantId, kind));
    });
  }

  public clear(): void {
    this.streams.clear();
  }

  private holdsExactly(stream: MediaStream, tracks: MediaStreamTrack[]): boolean {
    const present = stream.getTracks();
    if (present.length !== tracks.length) return false;
    const wanted = new Set(tracks.map((track) => track.id));
    return present.every((track) => wanted.has(track.id));
  }

  private keyOf(participantId: string, kind: ParticipantStreamKind): string {
    return `${participantId}:${kind}`;
  }
}
