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

  // Floating panels measure themselves, which jsdom cannot do.
  if (typeof globalThis.ResizeObserver === 'undefined') {
    globalThis.ResizeObserver = class {
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
    } as unknown as typeof ResizeObserver;
  }
  if (typeof globalThis.DOMRect === 'undefined') {
    globalThis.DOMRect = class {
      constructor(
        public x = 0,
        public y = 0,
        public width = 0,
        public height = 0,
      ) {}
      get top() { return this.y; }
      get left() { return this.x; }
      get right() { return this.x + this.width; }
      get bottom() { return this.y + this.height; }
      toJSON() { return this; }
      static fromRect(rect?: DOMRectInit) { return new DOMRect(rect?.x, rect?.y, rect?.width, rect?.height); }
    } as unknown as typeof DOMRect;
  }

  // jsdom dispatches no PointerEvent, so React never sees the press that opens
  // a menu. A mouse event carries everything these components read.
  if (typeof globalThis.PointerEvent === 'undefined') {
    globalThis.PointerEvent = class extends MouseEvent {
      public readonly pointerId: number;
      public readonly pointerType: string;
      public readonly isPrimary: boolean;
      constructor(type: string, options: PointerEventInit = {}) {
        super(type, options);
        this.pointerId = options.pointerId ?? 1;
        this.pointerType = options.pointerType ?? 'mouse';
        this.isPrimary = options.isPrimary ?? true;
      }
    } as unknown as typeof PointerEvent;
  }

  // Radix menus and sliders use pointer capture, which jsdom does not implement.
  HTMLElement.prototype.hasPointerCapture = () => false;
  HTMLElement.prototype.setPointerCapture = () => undefined;
  HTMLElement.prototype.releasePointerCapture = () => undefined;
  HTMLElement.prototype.scrollIntoView = () => undefined;

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
