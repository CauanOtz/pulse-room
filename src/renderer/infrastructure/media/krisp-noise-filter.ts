import type { AudioProcessorOptions, Track, TrackProcessor } from 'livekit-client';

export type NoiseFilter = TrackProcessor<Track.Kind.Audio, AudioProcessorOptions>;

/**
 * Krisp is licensed through LiveKit Cloud and refuses to run against any other
 * voice server, so a self-hosted room keeps the filter this client brings.
 */
export function runsOnLiveKitCloud(serverUrl: string | undefined): boolean {
  if (!serverUrl) return false;
  try {
    const host = new URL(serverUrl).hostname;
    return host.endsWith('.livekit.cloud') || host.endsWith('.livekit.run');
  } catch {
    return false;
  }
}

let library: Promise<typeof import('@livekit/krisp-noise-filter')> | undefined;

/**
 * Krisp's filter, the one Discord uses, or nothing where this machine cannot
 * run it. The model is several megabytes, so it is loaded the first time a
 * call asks for it rather than with the app.
 */
export async function createKrispFilter(): Promise<NoiseFilter | undefined> {
  library ??= import('@livekit/krisp-noise-filter');
  // A failed load is tried again next call rather than remembered.
  library.catch(() => (library = undefined));
  const { KrispNoiseFilter, isKrispNoiseFilterSupported } = await library;
  if (!isKrispNoiseFilterSupported()) return undefined;
  return KrispNoiseFilter();
}
