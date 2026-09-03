import { describe, expect, it } from 'vitest';
import { accentFor, channelRoster, initialsOf } from '../../src/renderer/domain/roster';
import type { Participant } from '../../src/renderer/domain/conference';

const you: Participant = {
  id: 'you',
  name: 'Merge lounge Microphone',
  initials: 'ML',
  accent: '#a8bdff',
  isLocal: true,
  isMuted: false,
  isSpeaking: true,
  volume: 100,
  locallyMuted: false,
};

const occupancy = [{ roomId: 'game-room', occupants: [{ identity: 'babi-77', name: 'babi' }] }];

describe('channelRoster', () => {
  it('describes the channel you joined from the live call', () => {
    const roster = channelRoster('lounge', 'lounge', [you], occupancy);

    expect(roster).toEqual([expect.objectContaining({ id: 'you', isSpeaking: true, detailed: true })]);
  });

  it('shows the people waiting in the other channels', () => {
    const roster = channelRoster('game-room', 'lounge', [you], occupancy);

    expect(roster).toEqual([
      expect.objectContaining({ id: 'babi-77', name: 'babi', initials: 'B', detailed: false }),
    ]);
  });

  it('leaves an empty channel empty', () => {
    expect(channelRoster('game-room', 'lounge', [you], [])).toEqual([]);
  });

  it('reads initials from a name and keeps a colour stable per person', () => {
    expect(initialsOf('Merge lounge Microphone')).toBe('ML');
    expect(initialsOf('babi')).toBe('B');
    expect(accentFor('babi-77')).toBe(accentFor('babi-77'));
  });
});
