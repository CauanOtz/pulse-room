import { execFile } from 'node:child_process';
import { nativeImage, type BrowserWindow } from 'electron';
import type { DesktopActivity } from '../../shared/desktop-api';
import { findGame, musicOf, type RunningProcess } from './activity-detection';
import { gameArt, shrink } from './game-art';
import { mediaSessionCommand } from './media-session';

/** Often enough to catch a game being opened, rare enough to cost nothing. */
const everyMs = 20_000;

// One PowerShell call lists the programs with their paths and window titles.
const listing = [
  '-NoProfile',
  '-NonInteractive',
  '-Command',
  'Get-Process | Where-Object { $_.MainWindowTitle -or $_.Path } | Select-Object ProcessName,Path,MainWindowTitle | ConvertTo-Json -Compress',
];

interface MediaReading {
  app?: string;
  title?: string;
  artist?: string;
  cover?: string | null;
  /** The song's length in seconds. */
  length?: number | null;
  /** How far in, in seconds, at the moment below. */
  position?: number | null;
  updatedAt?: number | null;
}

/** Players restate the position with a little jitter; less than this is the same moment. */
const jitterMs = 3_000;

/**
 * Watches what this computer is playing and listening to, with a picture of
 * each, and tells the window when it changes. Windows only; elsewhere it
 * reports nothing.
 */
export class ActivityService {
  private current: DesktopActivity = { game: null, music: null };
  private timer?: ReturnType<typeof setInterval>;
  private reading = false;
  /** The song whose cover was last read, so the same cover is not read again. */
  private song?: { key: string; art: string | null; startedAt?: number };

  public constructor(private readonly getWindow: () => BrowserWindow | null) {}

  public start(): void {
    if (process.platform !== 'win32' || this.timer) return;
    void this.read();
    this.timer = setInterval(() => void this.read(), everyMs);
  }

  public stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }

  public now(): DesktopActivity {
    return this.current;
  }

  private async read(): Promise<void> {
    if (this.reading) return;
    this.reading = true;
    try {
      const [processes, media] = await Promise.all([
        run<RunningProcess | RunningProcess[]>(listing).then((list) => (Array.isArray(list) ? list : [list])),
        run<MediaReading | null>(mediaSessionCommand(this.song?.key ?? '')).catch(() => null),
      ]);
      const found = findGame(processes);
      const next: DesktopActivity = {
        game: found?.name ?? null,
        gameArt: found ? await gameArt(found) : null,
        music: this.music(media) ?? musicOf(processes),
      };
      if (JSON.stringify(next) === JSON.stringify(this.current)) return;
      this.current = next;
      this.getWindow()?.webContents.send('activity:changed', next);
    } catch {
      // A listing that fails this time is tried again at the next turn.
    } finally {
      this.reading = false;
    }
  }

  /** The song from the media controls, with its cover, read again only when the song changes. */
  private music(media: MediaReading | null): DesktopActivity['music'] {
    const title = media?.title?.trim();
    if (!title) return null;
    const artist = media?.artist?.trim() || 'Unknown artist';
    const key = `${media!.title}|${media!.artist}`;
    if (this.song?.key !== key || media?.cover) {
      const image = media?.cover
        ? nativeImage.createFromBuffer(Buffer.from(media.cover, 'base64'))
        : undefined;
      this.song = { key, art: image && !image.isEmpty() ? shrink(image, 128) : null };
    }
    const timed = this.timeline(media!);
    return {
      title,
      artist,
      art: this.song.art,
      spotify: /spotify/i.test(media?.app ?? ''),
      ...(timed ?? {}),
    };
  }

  /**
   * When the song would have begun, had it played straight through: one moment
   * that stays the same while it plays, so listeners count forward on their own
   * and nothing is sent again until the person skips, seeks or pauses.
   */
  private timeline(media: MediaReading): { length: number; startedAt: string } | null {
    const length = media.length ?? 0;
    if (!this.song || length <= 0 || length > 86_400 || media.position == null) return null;
    const now = Date.now();
    // A player that never says when it last updated is taken to mean now.
    const at =
      media.updatedAt && media.updatedAt > now - 86_400_000 && media.updatedAt <= now ? media.updatedAt : now;
    const startedAt = Math.round((at - media.position * 1000) / 1000) * 1000;
    if (this.song.startedAt === undefined || Math.abs(this.song.startedAt - startedAt) > jitterMs)
      this.song.startedAt = startedAt;
    return { length: Math.round(length), startedAt: new Date(this.song.startedAt).toISOString() };
  }
}

function run<Result>(args: string[]): Promise<Result> {
  return new Promise((resolve, reject) => {
    execFile(
      'powershell.exe',
      args,
      { windowsHide: true, timeout: 12_000, maxBuffer: 16 * 1024 * 1024 },
      (error, stdout) => {
        if (error) return reject(error);
        try {
          resolve(JSON.parse(stdout.trim() || 'null') as Result);
        } catch (problem) {
          reject(problem);
        }
      },
    );
  });
}
