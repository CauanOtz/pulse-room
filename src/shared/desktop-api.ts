export interface CaptureSource {
  id: string;
  name: string;
  thumbnailDataUrl: string;
  displayId: string;
}

export type UpdateStatus =
  | { state: 'idle' }
  | { state: 'checking' }
  | { state: 'available'; version: string }
  | { state: 'not-available'; version: string }
  | {
      state: 'downloading';
      percent: number;
      version?: string;
      bytesPerSecond?: number;
      transferred?: number;
      total?: number;
    }
  | { state: 'downloaded'; version: string }
  | { state: 'error'; message: string };

/** The update the running version came from, told once after it installs. */
export interface FinishedUpdate {
  from: string;
  to: string;
}

import type { ShortcutAction } from './shortcuts';

/** The game being played and the song on Spotify, as this computer sees them. */
export interface DesktopActivity {
  game: string | null;
  /** A small picture of the game, as a data URL: its store cover or its icon. */
  gameArt?: string | null;
  music: {
    title: string;
    artist: string;
    art?: string | null;
    spotify?: boolean;
    /** The song's length in seconds, when the player tells it. */
    length?: number;
    /** When the song would have begun had it played straight through. */
    startedAt?: string;
  } | null;
}

/** A message worth interrupting for, shown by the system outside the window. */
export interface DesktopNotice {
  title: string;
  body: string;
  /** Said back when it is clicked, so the app knows what to open. */
  tag: string;
}

export interface DesktopApi {
  session: {
    read(): Promise<string | null>;
    save(token: string | null): Promise<boolean>;
  };
  app: {
    getVersion(): Promise<string>;
    getPlatform(): Promise<NodeJS.Platform>;
  };
  capture: {
    listScreens(): Promise<CaptureSource[]>;
    selectSource(sourceId: string): Promise<void>;
  };
  shortcuts?: {
    /** Turns the machine-wide shortcuts on or off; resolves to those that took. */
    setGlobal(enabled: boolean): Promise<ShortcutAction[]>;
    onTrigger(listener: (action: ShortcutAction) => void): () => void;
  };
  updates: {
    check(): Promise<UpdateStatus>;
    install(): Promise<void>;
    /** Where the updater stands now, without asking the server again. */
    current?(): Promise<UpdateStatus>;
    /** The update this launch finished, once; null on every other launch. */
    finished?(): Promise<FinishedUpdate | null>;
    onStatus(listener: (status: UpdateStatus) => void): () => void;
  };
  /** What this computer is playing and listening to; Windows only. */
  activity?: {
    current(): Promise<DesktopActivity>;
    onChange(listener: (activity: DesktopActivity) => void): () => void;
  };
  notifications?: {
    show(notice: DesktopNotice): Promise<void>;
    /** A notification was clicked; the window is already in front. */
    onOpen(listener: (tag: string) => void): () => void;
  };
}
