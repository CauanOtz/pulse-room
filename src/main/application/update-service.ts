import { app, BrowserWindow } from 'electron';
import { autoUpdater } from 'electron-updater';
import type { UpdateStatus } from '../../shared/desktop-api';

export class UpdateService {
  private status: UpdateStatus = { state: 'idle' };

  public constructor(private readonly getWindow: () => BrowserWindow | null) {
    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;
    this.registerEvents();
  }

  public async check(): Promise<UpdateStatus> {
    if (!app.isPackaged) {
      return this.setStatus({ state: 'not-available', version: app.getVersion() });
    }

    this.setStatus({ state: 'checking' });
    await autoUpdater.checkForUpdates();
    return this.status;
  }

  public install(): void {
    if (this.status.state === 'downloaded') {
      autoUpdater.quitAndInstall(false, true);
    }
  }

  private registerEvents(): void {
    autoUpdater.on('checking-for-update', () => this.setStatus({ state: 'checking' }));
    autoUpdater.on('update-available', (info) =>
      this.setStatus({ state: 'available', version: info.version }),
    );
    autoUpdater.on('update-not-available', (info) =>
      this.setStatus({ state: 'not-available', version: info.version }),
    );
    autoUpdater.on('download-progress', (progress) =>
      this.setStatus({ state: 'downloading', percent: Math.round(progress.percent) }),
    );
    autoUpdater.on('update-downloaded', (info) =>
      this.setStatus({ state: 'downloaded', version: info.version }),
    );
    autoUpdater.on('error', (error) =>
      this.setStatus({ state: 'error', message: error.message }),
    );
  }

  private setStatus(status: UpdateStatus): UpdateStatus {
    this.status = status;
    this.getWindow()?.webContents.send('updates:status', status);
    return status;
  }
}
