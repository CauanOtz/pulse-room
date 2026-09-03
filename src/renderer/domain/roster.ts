import type { Participant } from './conference';

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
  /** False for people in a channel this client has not joined. */
  detailed: boolean;
}

export interface ChannelOccupancy {
  roomId: string;
  occupants: { identity: string; name: string }[];
}

const accents = ['#ee8d72', '#7c98ed', '#7bc6aa', '#d0a3ea', '#e5c07b'];

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
      detailed: true,
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
    detailed: false,
  }));
}
