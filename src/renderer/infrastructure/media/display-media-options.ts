import type { ScreenShareOptions } from '../../domain/conference';

export function createDisplayMediaOptions(options: ScreenShareOptions): DisplayMediaStreamOptions {
  const chromiumOptions = {
    video: {
      width: { ideal: options.width },
      height: { ideal: options.height },
      frameRate: { ideal: options.frameRate },
    },
    audio: {
      channelCount: { ideal: 2 },
      sampleRate: { ideal: 48_000 },
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
      restrictOwnAudio: true,
    },
    systemAudio: 'include',
  };

  // Chromium exposes systemAudio and restrictOwnAudio before TypeScript's DOM library.
  return chromiumOptions as DisplayMediaStreamOptions;
}
