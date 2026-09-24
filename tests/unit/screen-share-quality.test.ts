import { describe, expect, it, vi } from 'vitest';
import { updateScreenShareTrack } from '../../src/renderer/infrastructure/media/screen-share-quality';

describe('live screen quality', () => {
  it('updates the existing capture and sender instead of replacing the track', async () => {
    const applyConstraints = vi.fn(async () => undefined);
    const mediaTrack = {
      contentHint: 'detail',
      applyConstraints,
    } as unknown as MediaStreamTrack;
    const parameters: RTCRtpSendParameters = {
      codecs: [],
      encodings: [{ active: true }, { active: false, maxBitrate: 10 }],
      headerExtensions: [],
      rtcp: { cname: '', reducedSize: true },
      transactionId: 'current-sender',
    };
    const setParameters = vi.fn(async () => undefined);
    const sender = {
      transport: { state: 'connected' },
      getParameters: vi.fn(() => parameters),
      setParameters,
    } as unknown as RTCRtpSender;

    await updateScreenShareTrack(mediaTrack, sender, {
      width: 1280,
      height: 720,
      frameRate: 30,
      maxBitrate: 2_500_000,
      contentHint: 'motion',
    });

    expect(mediaTrack.contentHint).toBe('motion');
    expect(applyConstraints).toHaveBeenCalledWith({
      width: { ideal: 1280, max: 1280 },
      height: { ideal: 720, max: 720 },
      frameRate: { ideal: 30, max: 30 },
    });
    expect(parameters.encodings[0]).toMatchObject({
      active: true,
      maxBitrate: 2_500_000,
      maxFramerate: 30,
      scaleResolutionDownBy: 1,
    });
    expect(parameters.encodings[1]).toEqual({ active: false, maxBitrate: 10 });
    expect(setParameters).toHaveBeenCalledWith(parameters);
  });
});
