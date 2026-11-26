import { app, BrowserWindow } from 'electron';
import path from 'node:path';
import type { LaunchScreen, LaunchView } from './launch-update';

/**
 * The small window that opens first while the app makes sure it is up to
 * date. A page of its own in the assets, with no preload and nothing from the
 * network: the main process writes each moment into it, and the one thing it
 * can say back, "open without updating", arrives as a change of its address.
 */
export function openLaunchWindow(): { window: BrowserWindow; view: LaunchView } {
  const window = new BrowserWindow({
    width: 300,
    height: 340,
    resizable: false,
    maximizable: false,
    minimizable: false,
    fullscreenable: false,
    frame: false,
    show: false,
    center: true,
    title: 'Pulse Room',
    backgroundColor: '#000000',
    icon: path.join(__dirname, '../../../assets/app-icon.png'),
    webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false },
  });
  window.setMenu(null);
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event) => event.preventDefault());

  let ready = false;
  let pending: LaunchScreen | undefined;
  const draw = (screen: LaunchScreen) => {
    if (window.isDestroyed()) return;
    if (!ready) {
      pending = screen;
      return;
    }
    void window.webContents
      .executeJavaScript(`window.pulseLaunch && window.pulseLaunch(${JSON.stringify(screen)})`)
      .catch(() => undefined);
  };
  window.webContents.once('did-finish-load', () => {
    ready = true;
    if (pending) draw(pending);
  });
  window.once('ready-to-show', () => window.show());
  void window.loadFile(path.join(__dirname, '../../../assets/launch.html'), {
    query: { version: app.getVersion() },
  });

  return {
    window,
    view: {
      show: draw,
      onSkip(listener) {
        window.webContents.on('did-navigate-in-page', (_event, url) => {
          if (new URL(url).hash === '#open') listener();
        });
      },
    },
  };
}
