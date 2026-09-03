import { afterEach, describe, expect, it, vi } from 'vitest';
import { MicrophoneTrackFactory } from '../../src/renderer/infrastructure/media/microphone-track-factory';
import type { MicrophoneOptions } from '../../src/renderer/domain/conference';

const options: MicrophoneOptions = {
  gain: 1,
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
  noiseGateThreshold: -50,
};

function createInputStream(): MediaStream {
  const track = { id: 'mic-1', kind: 'audio', stop: vi.fn() } as unknown as MediaStreamTrack;
  return new MediaStream([track]);
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('MicrophoneTrackFactory', () => {
  it('publishes the plain microphone when the audio engine cannot be built', async () => {
    const stream = createInputStream();
    const getUserMedia = vi.fn(async () => stream);
    vi.stubGlobal('navigator', { ...navigator, mediaDevices: { getUserMedia } });
    vi.stubGlobal('AudioContext', class {
      public constructor() {
        throw new Error('no audio engine here');
      }
    });
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const track = await new MicrophoneTrackFactory().create(options);

    expect(track.processed).toBe(false);
    expect(track.track.id).toBe('mic-1');
  });

  it('falls back to the default input when the saved device is gone', async () => {
    const stream = createInputStream();
    const getUserMedia = vi.fn(async (constraints: MediaStreamConstraints) => {
      const audio = constraints.audio as MediaTrackConstraints;
      if (audio.deviceId) throw new Error('OverconstrainedError');
      return stream;
    });
    vi.stubGlobal('navigator', { ...navigator, mediaDevices: { getUserMedia } });
    vi.stubGlobal('AudioContext', class {
      public constructor() {
        throw new Error('no audio engine here');
      }
    });
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const track = await new MicrophoneTrackFactory().create({ ...options, deviceId: 'gone-usb-mic' });

    expect(getUserMedia).toHaveBeenCalledTimes(2);
    expect(track.track.id).toBe('mic-1');
  });

  it('gives up only when there is no microphone at all', async () => {
    const getUserMedia = vi.fn(async () => {
      throw new Error('Requested device not found');
    });
    vi.stubGlobal('navigator', { ...navigator, mediaDevices: { getUserMedia } });

    await expect(new MicrophoneTrackFactory().create(options)).rejects.toThrow('Requested device not found');
  });
});
