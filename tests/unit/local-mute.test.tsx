import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import { RoomEvent, Track } from 'livekit-client';
import { MediaOutput } from '../../src/renderer/components/media-output';
import { audioPlayback } from '../../src/renderer/infrastructure/media/audio-playback-engine';
import { LiveKitConferenceGateway } from '../../src/renderer/infrastructure/conference/livekit-conference-gateway';
import { ListeningLevels } from '../../src/renderer/infrastructure/persistence/listening-levels';

afterEach(() => vi.restoreAllMocks());

const stream = () => ({ id: Math.random().toString(36), getTracks: () => [] }) as unknown as MediaStream;

describe('somebody muted on this machine', () => {
  it('stays muted when they come back with a new voice under the same name', () => {
    const handles: { setVolume: ReturnType<typeof vi.fn>; dispose: ReturnType<typeof vi.fn> }[] = [];
    vi.spyOn(audioPlayback, 'attach').mockImplementation(() => {
      const handle = { setVolume: vi.fn(), dispose: vi.fn() };
      handles.push(handle);
      return handle;
    });

    const { rerender } = render(<MediaOutput stream={stream()} volume={0} />);
    // They left and joined again: same person, same element, a new stream.
    rerender(<MediaOutput stream={stream()} volume={0} />);

    expect(handles).toHaveLength(2);
    expect(handles[1]!.setVolume).toHaveBeenCalledWith(0);
    expect(handles[1]!.setVolume).not.toHaveBeenCalledWith(100);
  });
});

describe('deafened', () => {
  function voice() {
    return {
      source: Track.Source.Microphone,
      kind: Track.Kind.Audio,
      isDesired: true,
      setSubscribed: vi.fn(function (this: { isDesired: boolean }, wanted: boolean) {
        this.isDesired = wanted;
      }),
    };
  }
  function person(identity: string, publication: ReturnType<typeof voice>) {
    return {
      identity,
      trackPublications: new Map([['mic', publication]]),
      audioTrackPublications: new Map([['mic', publication]]),
    };
  }

  it('covers whoever joins or comes back after the button was pressed', async () => {
    const gateway = new LiveKitConferenceGateway(
      { apiUrl: 'https://pulse.test', accessCode: 'x' },
      new ListeningLevels(),
    );
    const room = (
      gateway as unknown as {
        room: { remoteParticipants: Map<string, unknown>; emit(event: string, ...args: unknown[]): boolean };
      }
    ).room;
    const there = voice();
    room.remoteParticipants.set('ana:1', person('ana:1', there));
    await gateway.setDeafened(true);
    expect(there.setSubscribed).toHaveBeenLastCalledWith(false);

    const returning = voice();
    const leo = person('leo:1', returning);
    room.remoteParticipants.set('leo:1', leo);
    room.emit(RoomEvent.TrackPublished, returning, leo);
    expect(returning.setSubscribed).toHaveBeenCalledWith(false);
    expect(returning.isDesired).toBe(false);

    await gateway.setDeafened(false);
    expect(returning.isDesired).toBe(true);
    expect(there.isDesired).toBe(true);
  });
});
