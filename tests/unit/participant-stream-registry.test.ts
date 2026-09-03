import { describe, expect, it } from 'vitest';
import { ParticipantStreamRegistry } from '../../src/renderer/infrastructure/media/participant-stream-registry';

function createTrack(id: string): MediaStreamTrack {
  return { id } as MediaStreamTrack;
}

describe('ParticipantStreamRegistry', () => {
  it('returns the same stream instance while the tracks stay the same', () => {
    const registry = new ParticipantStreamRegistry();
    const track = createTrack('screen-1');

    const first = registry.sync('maya', 'screen', [track]);
    const second = registry.sync('maya', 'screen', [track]);

    expect(first).toBe(second);
    expect(first?.getTracks()).toHaveLength(1);
  });

  it('replaces the stream when the tracks change, so elements re-attach', () => {
    const registry = new ParticipantStreamRegistry();
    const video = createTrack('screen-video');
    const audio = createTrack('screen-audio');

    const stream = registry.sync('maya', 'screen', [video]);

    const withAudio = registry.sync('maya', 'screen', [video, audio]);
    expect(withAudio).not.toBe(stream);
    expect(withAudio?.getTracks().map((track) => track.id)).toEqual(['screen-video', 'screen-audio']);

    const again = registry.sync('maya', 'screen', [video, audio]);
    expect(again).toBe(withAudio);

    const republished = registry.sync('maya', 'screen', [createTrack('screen-video-2')]);
    expect(republished).not.toBe(withAudio);
    expect(republished?.getTracks().map((track) => track.id)).toEqual(['screen-video-2']);
  });

  it('separates kinds and participants', () => {
    const registry = new ParticipantStreamRegistry();

    const screen = registry.sync('maya', 'screen', [createTrack('a')]);
    const microphone = registry.sync('maya', 'microphone', [createTrack('b')]);
    const other = registry.sync('noah', 'screen', [createTrack('c')]);

    expect(screen).not.toBe(microphone);
    expect(screen).not.toBe(other);
  });

  it('reports no stream when a participant publishes nothing', () => {
    const registry = new ParticipantStreamRegistry();

    expect(registry.sync('maya', 'screen', [])).toBeUndefined();
  });

  it('drops streams when a participant leaves so a rejoin starts clean', () => {
    const registry = new ParticipantStreamRegistry();
    const track = createTrack('screen-1');

    const before = registry.sync('maya', 'screen', [track]);
    registry.forget('maya');
    const after = registry.sync('maya', 'screen', [track]);

    expect(after).not.toBe(before);
  });
});
