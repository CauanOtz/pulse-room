import { describe, expect, it } from 'vitest';
import { emptyPresence, presenceSounds, type RoomPresence } from '../../src/renderer/application/room-presence';

function inRoom(overrides: Partial<RoomPresence> = {}): RoomPresence {
  return { connected: true, remoteIds: [], microphoneOn: true, broadcastIds: [], ...overrides };
}

describe('presenceSounds', () => {
  it('greets you once when you join a room that is already busy', () => {
    expect(presenceSounds(emptyPresence, inRoom({ remoteIds: ['maya', 'noah'] }))).toEqual(['join']);
  });

  it('plays a departure when you leave', () => {
    expect(presenceSounds(inRoom({ remoteIds: ['maya'] }), emptyPresence)).toEqual(['leave']);
  });

  it('announces a friend arriving and a friend leaving', () => {
    const before = inRoom({ remoteIds: ['maya'] });
    expect(presenceSounds(before, inRoom({ remoteIds: ['maya', 'noah'] }))).toEqual(['join']);
    expect(presenceSounds(before, inRoom({ remoteIds: [] }))).toEqual(['leave']);
    expect(presenceSounds(before, inRoom({ remoteIds: ['noah'] }))).toEqual(['join', 'leave']);
  });

  it('marks the microphone opening and closing', () => {
    const speaking = inRoom();
    expect(presenceSounds(speaking, inRoom({ microphoneOn: false }))).toEqual(['mute']);
    expect(presenceSounds(inRoom({ microphoneOn: false }), speaking)).toEqual(['unmute']);
  });

  it('marks a screen going live and coming down', () => {
    const quiet = inRoom();
    expect(presenceSounds(quiet, inRoom({ broadcastIds: ['babi'] }))).toEqual(['live-start']);
    expect(presenceSounds(inRoom({ broadcastIds: ['babi'] }), quiet)).toEqual(['live-stop']);
  });

  it('lets joining speak for the microphone that opened with it', () => {
    expect(presenceSounds(emptyPresence, inRoom({ microphoneOn: true, broadcastIds: ['babi'] }))).toEqual(['join']);
  });

  it('stays quiet while the room is unchanged', () => {
    const state = inRoom({ remoteIds: ['maya'] });
    expect(presenceSounds(state, state)).toEqual([]);
    expect(presenceSounds(emptyPresence, emptyPresence)).toEqual([]);
  });
});
