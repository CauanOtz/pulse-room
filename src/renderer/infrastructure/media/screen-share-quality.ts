import type { ScreenShareOptions } from '../../domain/conference';

/**
 * Retunes a captured monitor and its WebRTC sender without replacing either.
 * Keeping both objects alive is what prevents the live and its audio from
 * briefly disappearing for viewers.
 */
export async function updateScreenShareTrack(
  mediaTrack: MediaStreamTrack,
  sender: RTCRtpSender | undefined,
  options: ScreenShareOptions,
): Promise<void> {
  mediaTrack.contentHint = options.contentHint;
  await mediaTrack.applyConstraints({
    width: { ideal: options.width, max: options.width },
    height: { ideal: options.height, max: options.height },
    frameRate: { ideal: options.frameRate, max: options.frameRate },
  });

  if (!sender || sender.transport?.state === 'closed') return;
  const parameters = sender.getParameters();
  if (!parameters.encodings?.length) return;
  for (const encoding of parameters.encodings) {
    if (encoding.active === false) continue;
    encoding.maxBitrate = options.maxBitrate;
    encoding.maxFramerate = options.frameRate;
    encoding.scaleResolutionDownBy = 1;
  }
  await sender.setParameters(parameters);
}
