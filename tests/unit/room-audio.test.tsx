import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { RoomAudio } from '../../src/renderer/components/room-audio';
import type { Participant } from '../../src/renderer/domain/conference';

afterEach(cleanup);

const track = (kind: 'audio' | 'video') => ({ kind, id: kind, stop: () => undefined }) as MediaStreamTrack;

const person = (overrides: Partial<Participant> & Pick<Participant, 'id' | 'name'>): Participant => ({
  initials: overrides.name.slice(0, 2).toUpperCase(),
  accent: '#a8bdff',
  isLocal: false,
  isMuted: false,
  isSpeaking: false,
  volume: 100,
  locallyMuted: false,
  isBroadcasting: false,
  ...overrides,
});

describe('RoomAudio', () => {
  it('plays a screen that nobody is watching', () => {
    // The picture is what costs a machine anything. Somebody who turned it off
    // is still in the room, and the room still has the music in it.
    render(
      <RoomAudio
        participants={[
          person({
            id: 'maya',
            name: 'Maya',
            isBroadcasting: true,
            screenStream: new MediaStream([track('audio')]),
          }),
        ]}
        screenVolumes={{ maya: 180 }}
      />,
    );

    const players = [...document.querySelectorAll('audio, video')] as HTMLMediaElement[];
    expect(players).toHaveLength(1);
    expect(players[0].volume).toBeCloseTo(1);
  });

  it('keeps a voice and a screen on separate levels', () => {
    render(
      <RoomAudio
        participants={[
          person({
            id: 'maya',
            name: 'Maya',
            volume: 40,
            isBroadcasting: true,
            microphoneStream: new MediaStream([track('audio')]),
            screenStream: new MediaStream([track('audio'), track('video')]),
          }),
        ]}
        screenVolumes={{ maya: 20 }}
      />,
    );

    const players = [...document.querySelectorAll('audio, video')] as HTMLMediaElement[];
    expect(players.map((player) => Number(player.volume.toFixed(2)))).toEqual([0.4, 0.2]);
  });

  it('says nothing of its own', () => {
    render(<RoomAudio participants={[person({ id: 'you', name: 'You', isLocal: true })]} />);

    expect(document.querySelectorAll('audio, video')).toHaveLength(0);
  });
});
