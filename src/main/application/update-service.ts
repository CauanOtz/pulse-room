import { app, BrowserWindow } from 'electron';
import { autoUpdater } from 'electron-updater';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { FinishedUpdate, UpdateStatus } from '../../shared/desktop-api';

export class UpdateService {
  private status: UpdateStatus = { state: 'idle' };

  public constructor(private readonly getWindow: () => BrowserWindow | null) {
    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;
    this.registerEvents();
  }

  /** Read when somebody asks, not at start: a test run moves the profile first. */
  private get markerPath(): string {
    return path.join(app.getPath('userData'), 'pending-update.json');
  }

  public current(): UpdateStatus {
    return this.status;
  }

  public async check(): Promise<UpdateStatus> {
    if (!app.isPackaged) {
      return this.setStatus({ state: 'not-available', version: app.getVersion() });
    }

    this.setStatus({ state: 'checking' });
    await autoUpdater.checkForUpdates();
    return this.status;
  }

  /**
   * Installs without the installer's own wizard: the app has already drawn
   * its own screen, and the wizard would ask again for a folder chosen at the
   * first install. The marker tells the next launch what just happened.
   */
  public install(): void {
    if (this.status.state !== 'downloaded') return;
    try {
      const finished: FinishedUpdate = { from: app.getVersion(), to: this.status.version };
      writeFileSync(this.markerPath, JSON.stringify(finished));
    } catch {
      // Without the marker the update still installs; only the welcome is lost.
    }
    autoUpdater.quitAndInstall(true, true);
  }

  /**
   * The update this launch is the result of, said once. A marker for another
   * version means the install never landed, and is dropped without a word.
   */
  public takeFinished(): FinishedUpdate | null {
    let finished: FinishedUpdate | null = null;
    try {
      const stored = JSON.parse(readFileSync(this.markerPath, 'utf8')) as Partial<FinishedUpdate>;
      if (typeof stored.from === 'string' && stored.to === app.getVersion()) {
        finished = { from: stored.from, to: stored.to };
      }
    } catch {
      return null;
    }
    rmSync(this.markerPath, { force: true });
    return finished;
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
      this.setStatus({
        state: 'downloading',
        percent: Math.round(progress.percent),
        version: this.status.state === 'available' || this.status.state === 'downloading'
          ? this.status.version
          : undefined,
        bytesPerSecond: progress.bytesPerSecond,
        transferred: progress.transferred,
        total: progress.total,
      }),
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
