import type { Participant, SignalQuality } from './conference';

export interface RosterEntry {
  id: string;
  name: string;
  initials: string;
  accent: string;
  isLocal: boolean;
  isMuted: boolean;
  isSpeaking: boolean;
  volume: number;
  locallyMuted: boolean;
  avatarId?: string | null;
  /** True while they have a screen on the wire, watched or not. */
  isBroadcasting: boolean;
  /** The picture itself, which arrives only once somebody asks for it. */
  screenStream?: MediaStream;
  /** False for people in a channel this client has not joined. */
  detailed: boolean;
  /** Only known for the channel this client is in. */
  signal?: SignalQuality;
}

/** A voice identity is the account it belongs to, then its session. */
export const accountOf = (identity: string): string => identity.split(':')[0];

export interface ChannelOccupancy {
  roomId: string;
  occupants: { identity: string; name: string }[];
}

// Faces are told apart by value, not by hue: the room keeps its one colour for
// saying that something is live.
// Identity colour is deliberately softer than status colour. It adds enough
// variation to scan a busy room without competing with speaking/live states.
const accents = ['#F0AAA8', '#A8D7B9', '#E5C987', '#C6B4E3', '#A8CDD0'];

export function initialsOf(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');
}

export function accentFor(seed: string): string {
  const sum = [...seed].reduce((total, character) => total + character.charCodeAt(0), 0);
  return accents[sum % accents.length];
}

/**
 * Describes who is in one voice channel.
 *
 * The channel this client joined is described in full, from the live call. The
 * others are known only by the roster the service reports, which is enough to
 * see that somebody is waiting in the other room.
 */
export function channelRoster(
  channelId: string,
  activeChannelId: string,
  participants: Participant[],
  occupancy: ChannelOccupancy[],
  avatars: ReadonlyMap<string, string | null | undefined> = new Map(),
): RosterEntry[] {
  if (channelId === activeChannelId) {
    return participants.map((participant) => ({
      id: participant.id,
      name: participant.name,
      initials: participant.initials,
      accent: participant.accent,
      isLocal: participant.isLocal,
      isMuted: participant.isMuted,
      isSpeaking: participant.isSpeaking,
      volume: participant.volume,
      locallyMuted: participant.locallyMuted,
      avatarId: avatars.get(accountOf(participant.id)),
      isBroadcasting: participant.isBroadcasting,
      screenStream: participant.screenStream,
      detailed: true,
      signal: participant.signal,
    }));
  }

  const room = occupancy.find((entry) => entry.roomId === channelId);
  return (room?.occupants ?? []).map((occupant) => ({
    id: occupant.identity,
    name: occupant.name,
    initials: initialsOf(occupant.name),
    accent: accentFor(occupant.identity),
    isLocal: false,
    isMuted: false,
    isSpeaking: false,
    volume: 100,
    locallyMuted: false,
    avatarId: avatars.get(accountOf(occupant.identity)),
    // A room this client has not joined reports names and nothing else.
    isBroadcasting: false,
    detailed: false,
  }));
}
