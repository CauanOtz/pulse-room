import { describe, expect, it, vi } from 'vitest';
import { loadConfiguration } from '../../server/config';
import { LiveKitPresenceSource } from '../../server/presence-service';

const configuration = loadConfiguration({
  LIVEKIT_URL: 'wss://voice.example.test',
  LIVEKIT_API_KEY: 'test-key',
  LIVEKIT_API_SECRET: 'test-secret',
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

describe('concurrent voice presence reads', () => {
  it('shares one LiveKit lookup across clients and refreshes after the cache expires', async () => {
    let now = 0;
    const listing = deferred<{ name: string }[]>();
    const listRooms = vi.fn(() => listing.promise);
    const listParticipants = vi.fn(async () => [{ identity: 'person', name: 'Person' }]);
    const source = new LiveKitPresenceSource(
      configuration,
      { listRooms, listParticipants },
      2_000,
      () => now,
    );

    const pending = Array.from({ length: 5 }, () => source.read());
    listing.resolve([{ name: 'voice-room' }]);
    const readings = await Promise.all(pending);

    expect(readings).toEqual(
      Array.from({ length: 5 }, () => [
        { roomId: 'voice-room', occupants: [{ identity: 'person', name: 'Person' }] },
      ]),
    );
    expect(listRooms).toHaveBeenCalledTimes(1);
    expect(listParticipants).toHaveBeenCalledTimes(1);

    await source.read();
    expect(listRooms).toHaveBeenCalledTimes(1);

    now = 2_000;
    await Promise.all(Array.from({ length: 5 }, () => source.read()));
    expect(listRooms).toHaveBeenCalledTimes(2);
    expect(listParticipants).toHaveBeenCalledTimes(2);
  });

  it('releases a failed lookup so later callers can recover', async () => {
    const listing = deferred<{ name: string }[]>();
    const listRooms = vi.fn(() => listing.promise);
    const listParticipants = vi.fn(async () => [{ identity: 'person', name: 'Person' }]);
    const source = new LiveKitPresenceSource(configuration, { listRooms, listParticipants });

    const pending = Array.from({ length: 5 }, () => source.read());
    listing.reject(new Error('Voice server temporarily unavailable'));
    const readings = await Promise.allSettled(pending);

    expect(readings.every((reading) => reading.status === 'rejected')).toBe(true);
    expect(listRooms).toHaveBeenCalledTimes(1);
    expect(listParticipants).not.toHaveBeenCalled();

    listRooms.mockResolvedValue([{ name: 'voice-room' }]);
    expect(await source.read()).toEqual([
      { roomId: 'voice-room', occupants: [{ identity: 'person', name: 'Person' }] },
    ]);
    expect(listRooms).toHaveBeenCalledTimes(2);
  });
});
