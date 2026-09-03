export type ParticipantStreamKind = 'microphone' | 'screen';

/**
 * Keeps one long-lived MediaStream per participant and kind.
 *
 * The conference gateway rebuilds its snapshot on every room event, including
 * the frequent active-speaker updates. Handing a brand new MediaStream to the
 * media elements on each of those rebuilds restarts playback, which shows up as
 * a flickering screen share and short gaps in the audio. Mutating one stable
 * stream keeps the elements attached to the same object for the whole session.
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

    const stream = this.streams.get(key) ?? new MediaStream();
    const wanted = new Set(tracks.map((track) => track.id));

    stream.getTracks().forEach((track) => {
      if (!wanted.has(track.id)) stream.removeTrack(track);
    });
    tracks.forEach((track) => {
      if (!stream.getTrackById(track.id)) stream.addTrack(track);
    });

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

  private keyOf(participantId: string, kind: ParticipantStreamKind): string {
    return `${participantId}:${kind}`;
  }
}
