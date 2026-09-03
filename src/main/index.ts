import path from 'node:path';
import { app, BrowserWindow, ipcMain, session } from 'electron';
import { ScreenCaptureService } from './application/screen-capture-service';
import { UpdateService } from './application/update-service';

// Screen sharing needs media and display capture; the live stage needs the
// HTML fullscreen permission that Electron asks for separately.
const allowedPermissions = new Set(['media', 'display-capture', 'fullscreen']);

let mainWindow: BrowserWindow | null = null;
const screenCaptureService = new ScreenCaptureService();
const updateService = new UpdateService(() => mainWindow);

function createMainWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1080,
    minHeight: 680,
    show: false,
    title: 'Pulse Room',
    backgroundColor: '#0b1018',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  window.once('ready-to-show', () => window.show());
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));

  const developmentUrl = process.env.VITE_DEV_SERVER_URL;
  if (developmentUrl) {
    void window.loadURL(developmentUrl);
  } else {
    void window.loadFile(path.join(__dirname, '../../dist/index.html'));
  }

  return window;
}

function registerIpcHandlers(): void {
  ipcMain.handle('app:get-version', () => app.getVersion());
  ipcMain.handle('app:get-platform', () => process.platform);
  ipcMain.handle('capture:list-screens', () => screenCaptureService.listScreens());
  ipcMain.handle('capture:select-source', (_event, sourceId: string) => {
    screenCaptureService.selectSource(sourceId);
  });
  ipcMain.handle('updates:check', () => updateService.check());
  ipcMain.handle('updates:install', () => updateService.install());
}

app.whenReady().then(() => {
  screenCaptureService.install(session.defaultSession);
  registerIpcHandlers();
  mainWindow = createMainWindow();

  session.defaultSession.setPermissionCheckHandler((_webContents, permission) =>
    allowedPermissions.has(permission),
  );
  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    callback(allowedPermissions.has(permission));
  });

  if (app.isPackaged) {
    setTimeout(() => void updateService.check(), 5_000);
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      mainWindow = createMainWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
