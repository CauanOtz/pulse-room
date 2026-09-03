import { describe, expect, it } from 'vitest';
import { emptyPresence, presenceSounds } from '../../src/renderer/application/room-presence';

describe('presenceSounds', () => {
  it('greets you once when you join a room that is already busy', () => {
    expect(presenceSounds(emptyPresence, { connected: true, remoteIds: ['maya', 'noah'] })).toEqual(['join']);
  });

  it('plays a departure when you leave', () => {
    expect(presenceSounds({ connected: true, remoteIds: ['maya'] }, emptyPresence)).toEqual(['leave']);
  });

  it('announces a friend arriving and a friend leaving', () => {
    const before = { connected: true, remoteIds: ['maya'] };
    expect(presenceSounds(before, { connected: true, remoteIds: ['maya', 'noah'] })).toEqual(['join']);
    expect(presenceSounds(before, { connected: true, remoteIds: [] })).toEqual(['leave']);
    expect(presenceSounds(before, { connected: true, remoteIds: ['noah'] })).toEqual(['join', 'leave']);
  });

  it('stays quiet while the room is unchanged', () => {
    const state = { connected: true, remoteIds: ['maya'] };
    expect(presenceSounds(state, state)).toEqual([]);
    expect(presenceSounds(emptyPresence, emptyPresence)).toEqual([]);
  });
});
