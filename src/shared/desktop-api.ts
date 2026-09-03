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

export interface DesktopApi {
  app: {
    getVersion(): Promise<string>;
    getPlatform(): Promise<NodeJS.Platform>;
  };
  capture: {
    listScreens(): Promise<CaptureSource[]>;
    selectSource(sourceId: string): Promise<void>;
  };
  updates: {
    check(): Promise<UpdateStatus>;
    install(): Promise<void>;
    onStatus(listener: (status: UpdateStatus) => void): () => void;
  };
}
