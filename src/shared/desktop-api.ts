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
  | { state: 'downloading'; percent: number }
  | { state: 'downloaded'; version: string }
  | { state: 'error'; message: string };

import type { ShortcutAction } from './shortcuts';

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
    onStatus(listener: (status: UpdateStatus) => void): () => void;
  };
}
