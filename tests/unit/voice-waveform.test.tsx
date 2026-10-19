import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { VoiceWaveform } from '../../src/renderer/components/voice-waveform';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('VoiceWaveform', () => {
  it('shows no invented waveform when there is no audio track', () => {
    const create = vi.fn();
    vi.stubGlobal('AudioContext', create);
    render(<VoiceWaveform stream={new MediaStream()} name="Friend" />);
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(create).not.toHaveBeenCalled();
  });

  it('measures the existing stream without playback or stopping its tracks', () => {
    const stop = vi.fn();
    const stream = new MediaStream([{ kind: 'audio', id: 'voice', stop } as unknown as MediaStreamTrack]);
    const source = { connect: vi.fn(), disconnect: vi.fn() };
    const analyser = {
      fftSize: 512,
      getFloatTimeDomainData: vi.fn((samples: Float32Array) => samples.fill(0.1)),
    };
    const close = vi.fn(async () => {});
    const destination = {};
    vi.stubGlobal(
      'AudioContext',
      class {
        state = 'running';
        destination = destination;
        createAnalyser = () => analyser;
        createMediaStreamSource = vi.fn((received: MediaStream) => {
          expect(received).toBe(stream);
          return source;
        });
        resume = async () => {};
        close = close;
      },
    );
    const drawing = {
      clearRect: vi.fn(),
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      stroke: vi.fn(),
    };
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
      drawing as unknown as CanvasRenderingContext2D,
    );
    const view = render(<VoiceWaveform stream={stream} name="Friend" />);
    expect(screen.getByRole('img', { name: 'Audio activity for Friend' })).toBeInTheDocument();
    expect(analyser.getFloatTimeDomainData).toHaveBeenCalled();
    expect(drawing.lineTo).toHaveBeenCalledTimes(24);
    expect(source.connect).toHaveBeenCalledWith(analyser);
    expect(source.connect).not.toHaveBeenCalledWith(destination);
    view.unmount();
    expect(close).toHaveBeenCalledOnce();
    expect(source.disconnect).toHaveBeenCalledOnce();
    expect(stop).not.toHaveBeenCalled();
  });
});
