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

/**
 * The whole chain, standing in for the audio thread.
 *
 * Only enough of it to see what the factory wires together: which nodes are
 * joined to which, and that the gate's port reaches whoever asked to be told
 * when this microphone starts carrying a voice.
 */
function stubWorkingAudio() {
  const ports: { onmessage: ((event: MessageEvent<boolean>) => void) | null }[] = [];

  class Node {
    public connect(target: unknown): unknown {
      return target;
    }
    public disconnect(): void {}
  }

  class Param {
    public value = 0;
    public setValueAtTime(value: number): void {
      this.value = value;
    }
  }

  class WorkletNode extends Node {
    public readonly parameters = new Map([
      ['threshold', new Param()],
      ['enabled', new Param()],
      ['gain', new Param()],
    ]);
    public readonly port: { onmessage: ((event: MessageEvent<boolean>) => void) | null } = {
      onmessage: null,
    };
    public constructor() {
      super();
      ports.push(this.port);
    }
  }

  const outputTrack = { id: 'processed-1', kind: 'audio', stop: vi.fn() } as unknown as MediaStreamTrack;

  class Context {
    public state = 'running';
    public readonly currentTime = 0;
    public readonly audioWorklet = { addModule: vi.fn(async () => undefined) };
    public async resume(): Promise<void> {}
    public async close(): Promise<void> {
      this.state = 'closed';
    }
    public createMediaStreamSource(): Node {
      return new Node();
    }
    public createBiquadFilter(): Node & { type: string; frequency: { value: number } } {
      return Object.assign(new Node(), { type: '', frequency: { value: 0 } });
    }
    public createGain(): Node & { gain: { value: number } } {
      return Object.assign(new Node(), { gain: { value: 1 } });
    }
    public createDynamicsCompressor(): Node {
      return Object.assign(new Node(), {
        threshold: { value: 0 },
        knee: { value: 0 },
        ratio: { value: 0 },
        attack: { value: 0 },
        release: { value: 0 },
      });
    }
    public createMediaStreamDestination(): { stream: MediaStream } {
      return { stream: new MediaStream([outputTrack]) };
    }
  }

  vi.stubGlobal('AudioContext', Context);
  vi.stubGlobal('AudioWorkletNode', WorkletNode);
  return { ports };
}

describe('telling this machine that its own microphone is talking', () => {
  it('passes what the gate decides straight to whoever asked', async () => {
    const stream = createInputStream();
    vi.stubGlobal('navigator', { ...navigator, mediaDevices: { getUserMedia: vi.fn(async () => stream) } });
    const { ports } = stubWorkingAudio();
    const heard: boolean[] = [];

    const track = await new MicrophoneTrackFactory().create(options, (speaking) => heard.push(speaking));

    expect(track.processed).toBe(true);
    expect(ports).toHaveLength(1);

    ports[0].onmessage?.({ data: true } as MessageEvent<boolean>);
    ports[0].onmessage?.({ data: false } as MessageEvent<boolean>);

    // No interval, no round trip: the answer is already on this machine.
    expect(heard).toEqual([true, false]);
  });

  it('says the microphone went quiet when the graph is taken down', async () => {
    const stream = createInputStream();
    vi.stubGlobal('navigator', { ...navigator, mediaDevices: { getUserMedia: vi.fn(async () => stream) } });
    const { ports } = stubWorkingAudio();
    const heard: boolean[] = [];

    const track = await new MicrophoneTrackFactory().create(options, (speaking) => heard.push(speaking));
    ports[0].onmessage?.({ data: true } as MessageEvent<boolean>);
    await track.dispose();

    // A face left mid-sentence because the microphone closed is a bug.
    expect(heard).toEqual([true, false]);
    expect(ports[0].onmessage).toBeNull();
  });

  it('asks for nothing when nobody wants to be told', async () => {
    const stream = createInputStream();
    vi.stubGlobal('navigator', { ...navigator, mediaDevices: { getUserMedia: vi.fn(async () => stream) } });
    const { ports } = stubWorkingAudio();

    await new MicrophoneTrackFactory().create(options);

    expect(ports[0].onmessage).toBeNull();
  });
});
