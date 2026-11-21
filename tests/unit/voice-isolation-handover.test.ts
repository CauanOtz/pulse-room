import { afterEach, describe, expect, it, vi } from 'vitest';
import { MicrophoneTrackFactory } from '../../src/renderer/infrastructure/media/microphone-track-factory';
import { runsOnLiveKitCloud } from '../../src/renderer/infrastructure/media/krisp-noise-filter';
import type { MicrophoneOptions } from '../../src/renderer/domain/conference';

/** Every node knows what it feeds, so the test can follow the voice through the chain. */
class Node {
  public readonly feeds = new Set<Node>();
  public constructor(public readonly name: string) {}
  public connect<T extends Node>(target: T): T {
    this.feeds.add(target);
    return target;
  }
  public disconnect(target?: Node): void {
    if (target) this.feeds.delete(target);
    else this.feeds.clear();
  }
}

const destroyed = vi.fn();

vi.mock('@sapphi-red/web-noise-suppressor', () => ({
  RnnoiseWorkletNode: class extends Node {
    public constructor() {
      super('rnnoise');
    }
    public destroy() {
      destroyed();
    }
  },
}));

const options: MicrophoneOptions = {
  gain: 1,
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
  noiseGateThreshold: -50,
  voiceIsolation: true,
};

function stubAudio() {
  const nodes: Node[] = [];
  const made = <T extends Node>(node: T) => (nodes.push(node), node);
  class Param {
    public value = 0;
    public setValueAtTime(value: number) {
      this.value = value;
    }
  }
  class WorkletNode extends Node {
    public readonly parameters = new Map([
      ['threshold', new Param()],
      ['enabled', new Param()],
      ['gain', new Param()],
    ]);
    public readonly port = { onmessage: null };
    public constructor() {
      super('gate');
      nodes.push(this);
    }
  }
  const output = { id: 'processed', kind: 'audio', stop: vi.fn() } as unknown as MediaStreamTrack;
  class Context {
    public state = 'running';
    public readonly sampleRate = 48_000;
    public readonly currentTime = 0;
    public readonly audioWorklet = { addModule: vi.fn(async () => undefined) };
    public async resume() {}
    public async close() {
      this.state = 'closed';
    }
    public createMediaStreamSource() {
      return made(new Node('source'));
    }
    public createBiquadFilter() {
      return made(Object.assign(new Node('high pass'), { type: '', frequency: { value: 0 } }));
    }
    public createGain() {
      return made(Object.assign(new Node('gain'), { gain: { value: 1 } }));
    }
    public createDynamicsCompressor() {
      return made(new Node('limiter'));
    }
    public createMediaStreamDestination() {
      return { stream: new MediaStream([output]) };
    }
  }
  vi.stubGlobal('AudioContext', Context);
  vi.stubGlobal('AudioWorkletNode', WorkletNode);
  const input = { id: 'mic', kind: 'audio', stop: vi.fn() } as unknown as MediaStreamTrack;
  vi.stubGlobal('navigator', {
    ...navigator,
    mediaDevices: { getUserMedia: vi.fn(async () => new MediaStream([input])) },
  });
  return { find: (name: string) => nodes.find((node) => node.name === name)! };
}

afterEach(() => {
  vi.unstubAllGlobals();
  destroyed.mockClear();
});

describe('handing voice isolation over to the voice server', () => {
  it('runs the voice through the network until Krisp takes over, then straight to the gate', async () => {
    const { find } = stubAudio();
    const track = await new MicrophoneTrackFactory().create(options);
    const highPass = find('high pass');
    const gate = find('gate');

    expect([...highPass.feeds].map((node) => node.name)).toEqual(['rnnoise']);
    expect(highPass.feeds.has(gate)).toBe(false);

    track.dropOwnIsolation();

    expect([...highPass.feeds]).toEqual([gate]);
    expect(destroyed).toHaveBeenCalledTimes(1);

    // Once is all it takes; taking the graph down later does not do it twice.
    track.dropOwnIsolation();
    await track.dispose();
    expect(destroyed).toHaveBeenCalledTimes(1);
  });

  it('leaves a chain without the network as it was', async () => {
    const { find } = stubAudio();
    const track = await new MicrophoneTrackFactory().create({ ...options, voiceIsolation: false });
    const highPass = find('high pass');

    track.dropOwnIsolation();

    expect([...highPass.feeds]).toEqual([find('gate')]);
    expect(destroyed).not.toHaveBeenCalled();
  });
});

describe('runsOnLiveKitCloud', () => {
  it('knows the cloud by its host', () => {
    expect(runsOnLiveKitCloud('wss://pulse-room-abc123.livekit.cloud')).toBe(true);
    expect(runsOnLiveKitCloud('wss://pulse-room.eu.livekit.run')).toBe(true);
  });

  it('keeps a self-hosted server, or none, on the built-in filter', () => {
    expect(runsOnLiveKitCloud('ws://localhost:7880')).toBe(false);
    expect(runsOnLiveKitCloud('wss://livekit.example.com')).toBe(false);
    expect(runsOnLiveKitCloud('wss://livekit.cloud.example.com')).toBe(false);
    expect(runsOnLiveKitCloud(undefined)).toBe(false);
    expect(runsOnLiveKitCloud('not a url')).toBe(false);
  });
});
