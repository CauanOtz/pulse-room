import path from 'node:path';
import { app, BrowserWindow, ipcMain, Menu, nativeImage, session, Tray } from 'electron';
import { ScreenCaptureService } from './application/screen-capture-service';
import { UpdateService } from './application/update-service';
import { SessionVault } from './application/session-vault';

// Screen sharing needs media and display capture; the live stage needs the
// HTML fullscreen permission that Electron asks for separately.
const allowedPermissions = new Set(['media', 'display-capture', 'fullscreen']);
if (process.env.NODE_ENV === 'test' && process.env.PULSE_TEST_USER_DATA) {
  app.setPath('userData', process.env.PULSE_TEST_USER_DATA);
}

/*
 * Chromium runs audio in a process of its own so that a crashing sound driver
 * cannot take a browser down with it. This is not a browser: it is one window
 * whose entire purpose is the call, and a call whose audio has died is over
 * either way. Moving audio in with the main process is worth about seventy
 * megabytes of the five hundred this application costs, and takes one
 * inter-process hop out of the path a voice walks to the speakers.
 *
 * Measured on this machine: 501 MB across six processes before, 426 MB across
 * five after. The video capture service is the other large one and it stays,
 * because it is what screen sharing is served by.
 */
app.commandLine.appendSwitch("disable-features", "AudioServiceOutOfProcess");

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
// Closing the window would end a call the room is still in, so the application
// steps into the tray instead and only leaves when it is asked to.
let quitting = false;
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
    icon: path.join(__dirname, '../../assets/app-icon.png'),
    // The room is black, and a window that paints slate for the first frame
    // announces itself before it has drawn anything.
    backgroundColor: '#000000',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  window.once('ready-to-show', () => window.show());
  window.on('close', (event) => {
    if (quitting) return;
    event.preventDefault();
    window.hide();
    announceTray();
  });
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event) => event.preventDefault());

  const developmentUrl = process.env.VITE_DEV_SERVER_URL;
  if (developmentUrl) {
    void window.loadURL(developmentUrl);
  } else {
    void window.loadFile(path.join(__dirname, '../../dist/index.html'));
  }

  return window;
}

// Somebody who closes the window and hears nothing more would think the call
// died, so the first time it happens the tray says where it went.
let trayAnnounced = false;
function announceTray(): void {
  if (trayAnnounced || !tray) return;
  trayAnnounced = true;
  if (process.platform !== 'win32') return;
  tray.displayBalloon({
    title: 'Pulse Room is still here',
    content: 'The call keeps running. Open it again from the tray, or quit from its menu.',
    iconType: 'info',
  });
}

function revealWindow(): void {
  const window = mainWindow ?? (mainWindow = createMainWindow());
  if (window.isMinimized()) window.restore();
  window.show();
  window.focus();
}

function createTray(): void {
  // Windows draws the notification-area icon at 16 or 32 physical pixels.
  // Feeding it the prepared small asset keeps the mark crisp and avoids
  // decoding the full-size source image in the main process.
  const icon = nativeImage.createFromPath(path.join(__dirname, '../../assets/tray-32.png'));
  tray = new Tray(icon.isEmpty() ? nativeImage.createEmpty() : icon);
  tray.setToolTip('Pulse Room');
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Open Pulse Room', click: revealWindow },
      { type: 'separator' },
      {
        label: 'Quit Pulse Room',
        click: () => {
          quitting = true;
          app.quit();
        },
      },
    ]),
  );
  tray.on('click', revealWindow);
}

function registerIpcHandlers(): void {
  const vault = new SessionVault();
  ipcMain.handle('session:read', (event) => {
    if (event.sender !== mainWindow?.webContents) throw new Error('Invalid sender');
    return vault.read();
  });
  ipcMain.handle('session:save', (event, token: string | null) => {
    if (event.sender !== mainWindow?.webContents) throw new Error('Invalid sender');
    return vault.save(token);
  });
  ipcMain.handle('app:get-version', () => app.getVersion());
  ipcMain.handle('app:get-platform', () => process.platform);
  ipcMain.handle('capture:list-screens', () => screenCaptureService.listScreens());
  ipcMain.handle('capture:select-source', (_event, sourceId: string) => {
    screenCaptureService.selectSource(sourceId);
  });
  ipcMain.handle('updates:check', () => updateService.check());
  ipcMain.handle('updates:install', () => updateService.install());
}

// A second launch belongs to the window already in the tray.
if (!app.requestSingleInstanceLock()) {
  app.quit();
}

app.on('second-instance', () => revealWindow());
app.on('before-quit', () => {
  quitting = true;
});

app.whenReady().then(() => {
  // The window is the whole application; a File, Edit, View and Window bar
  // above it belongs to a document editor. Editing shortcuts are the browser's
  // own and survive this, which the end-to-end test holds to.
  Menu.setApplicationMenu(null);
  // The only text typed here is a chat line, and a spell checker pulls a
  // dictionary down and keeps it resident for the life of the call.
  session.defaultSession.setSpellCheckerEnabled(false);
  screenCaptureService.install(session.defaultSession);
  registerIpcHandlers();
  mainWindow = createMainWindow();
  createTray();

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
  // Reached only once the window is really gone, which means a deliberate quit.
  if (process.platform !== 'darwin' && quitting) app.quit();
});
