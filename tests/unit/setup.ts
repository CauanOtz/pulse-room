import '@testing-library/jest-dom/vitest';

if (typeof window !== 'undefined') {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => undefined,
      removeListener: () => undefined,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      dispatchEvent: () => false,
    }),
  });

  // jsdom has no media stack; playback requests should resolve quietly.
  HTMLMediaElement.prototype.play = async () => undefined;
  HTMLMediaElement.prototype.pause = () => undefined;

  if (typeof globalThis.MediaStream === 'undefined') {
    class MediaStreamStub {
      private readonly tracks: MediaStreamTrack[] = [];

      public constructor(tracks: MediaStreamTrack[] = []) {
        tracks.forEach((track) => this.addTrack(track));
      }

      public getTracks(): MediaStreamTrack[] {
        return [...this.tracks];
      }

      public getAudioTracks(): MediaStreamTrack[] {
        return this.tracks.filter((track) => track.kind === 'audio');
      }

      public getVideoTracks(): MediaStreamTrack[] {
        return this.tracks.filter((track) => track.kind === 'video');
      }

      public getTrackById(id: string): MediaStreamTrack | null {
        return this.tracks.find((track) => track.id === id) ?? null;
      }

      public addTrack(track: MediaStreamTrack): void {
        if (!this.getTrackById(track.id)) this.tracks.push(track);
      }

      public removeTrack(track: MediaStreamTrack): void {
        const index = this.tracks.findIndex((candidate) => candidate.id === track.id);
        if (index >= 0) this.tracks.splice(index, 1);
      }
    }

    globalThis.MediaStream = MediaStreamStub as unknown as typeof MediaStream;
  }

  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: {
      enumerateDevices: async () => [],
    },
  });
}
