import type { DesktopApi } from '../../shared/desktop-api';

declare global {
  const __APP_VERSION__: string;

  interface Window {
    desktop?: DesktopApi;
  }
}

export {};
