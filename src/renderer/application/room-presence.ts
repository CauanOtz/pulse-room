import type { RoomSound } from '../infrastructure/media/room-sound-player';

export interface RoomPresence {
  connected: boolean;
  remoteIds: string[];
}

export const emptyPresence: RoomPresence = { connected: false, remoteIds: [] };

/**
 * Decides which arrival cues a change in the room deserves.
 *
 * Joining a busy room is one event, not one per person already sitting there,
 * so the roster is only compared while the connection itself stays put.
 */
export function presenceSounds(previous: RoomPresence, next: RoomPresence): RoomSound[] {
  if (!previous.connected && next.connected) return ['join'];
  if (previous.connected && !next.connected) return ['leave'];
  if (!next.connected) return [];

  const sounds: RoomSound[] = [];
  if (next.remoteIds.some((id) => !previous.remoteIds.includes(id))) sounds.push('join');
  if (previous.remoteIds.some((id) => !next.remoteIds.includes(id))) sounds.push('leave');
  return sounds;
}
