import type { ConferenceSnapshot, Participant } from '../../domain/conference';

/**
 * Telling two snapshots apart, so the room only redraws when it has changed.
 *
 * The gateway rebuilds its whole view of the call on every room event, and a
 * room with four people talking produces those several times a second: active
 * speakers, connection quality, tracks arriving and leaving. Each rebuild used
 * to allocate a new object per person and wake the entire interface, which is
 * work the machine does while it is also encoding a microphone and decoding
 * somebody's game.
 *
 * Nothing here changes what is drawn. It only refuses to draw it twice.
 */

export function sameParticipant(a: Participant, b: Participant): boolean {
  return (
    a.id === b.id &&
    a.name === b.name &&
    a.initials === b.initials &&
    a.accent === b.accent &&
    a.isLocal === b.isLocal &&
    a.isMuted === b.isMuted &&
    a.isSpeaking === b.isSpeaking &&
    a.volume === b.volume &&
    a.locallyMuted === b.locallyMuted &&
    a.isBroadcasting === b.isBroadcasting &&
    a.signal === b.signal &&
    a.microphoneStream === b.microphoneStream &&
    a.screenStream === b.screenStream
  );
}

/**
 * Keeps the object a person already had whenever nothing about them moved.
 *
 * Identity is what lets a list skip the rows that did not change, so one person
 * starting to talk costs one tile rather than the whole room.
 */
export function reuseParticipants(previous: Participant[], next: Participant[]): Participant[] {
  const byId = new Map(previous.map((participant) => [participant.id, participant]));
  let changed = previous.length !== next.length;
  const merged = next.map((participant, index) => {
    const before = byId.get(participant.id);
    if (before && sameParticipant(before, participant)) {
      // Order matters as much as membership: a kept object in a new position
      // is still a change the list has to hear about.
      if (previous[index] !== before) changed = true;
      return before;
    }
    changed = true;
    return participant;
  });
  return changed ? merged : previous;
}

const sameList = (a: readonly unknown[], b: readonly unknown[]): boolean =>
  a.length === b.length && a.every((value, index) => Object.is(value, b[index]));

/** True when applying this patch would leave the snapshot exactly as it is. */
export function patchChangesNothing(
  current: ConferenceSnapshot,
  patch: Partial<ConferenceSnapshot>,
): boolean {
  return (Object.keys(patch) as (keyof ConferenceSnapshot)[]).every((key) => {
    const before = current[key];
    const after = patch[key];
    if (Array.isArray(before) && Array.isArray(after)) return sameList(before, after);
    return Object.is(before, after);
  });
}
