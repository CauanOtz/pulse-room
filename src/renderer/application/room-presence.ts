import type { RoomSound } from '../infrastructure/media/room-sound-player';

export interface RoomPresence {
  connected: boolean;
  remoteIds: string[];
  microphoneOn: boolean;
  broadcastIds: string[];
}

export const emptyPresence: RoomPresence = {
  connected: false,
  remoteIds: [],
  microphoneOn: false,
  broadcastIds: [],
};

/**
 * Decides which cues a change in the room deserves.
 *
 * Joining a busy room is one event, not one per person already sitting there,
 * and not a microphone opening on top of it, so a change of connection speaks
 * for everything that came with it.
 */
export function presenceSounds(previous: RoomPresence, next: RoomPresence): RoomSound[] {
  if (!previous.connected && next.connected) return ['join'];
  if (previous.connected && !next.connected) return ['leave'];
  if (!next.connected) return [];

  const sounds: RoomSound[] = [];
  if (arrived(previous.remoteIds, next.remoteIds)) sounds.push('join');
  if (arrived(next.remoteIds, previous.remoteIds)) sounds.push('leave');
  if (previous.microphoneOn !== next.microphoneOn) sounds.push(next.microphoneOn ? 'unmute' : 'mute');
  if (arrived(previous.broadcastIds, next.broadcastIds)) sounds.push('live-start');
  if (arrived(next.broadcastIds, previous.broadcastIds)) sounds.push('live-stop');
  return sounds;
}

function arrived(before: string[], after: string[]): boolean {
  return after.some((id) => !before.includes(id));
}
