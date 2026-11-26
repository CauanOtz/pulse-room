import type { UpdateStatus } from '../../shared/desktop-api';

/** What the launch screen shows: one of four moments. */
export type LaunchScreen =
  | { phase: 'checking' }
  | {
      phase: 'downloading';
      version?: string;
      percent: number;
      transferred?: number;
      total?: number;
      bytesPerSecond?: number;
      /** Whether "Open without updating" is offered yet. */
      canSkip: boolean;
    }
  | { phase: 'installing'; version?: string }
  | { phase: 'starting' };

export interface LaunchUpdates {
  check(): Promise<UpdateStatus>;
  onStatus(listener: (status: UpdateStatus) => void): () => void;
  install(): void;
}

export interface LaunchView {
  show(screen: LaunchScreen): void;
  /** Called when the person chooses to open without waiting for the download. */
  onSkip(listener: () => void): void;
}

/** "open": carry on into the app. "installing": the app is about to close and come back updated. */
export type LaunchOutcome = 'open' | 'installing';

export const launchTiming = {
  /** No answer by then means no network, or a slow one: the app opens and asks again later. */
  checkMs: 10_000,
  /** A download that has not moved for this long is left to finish in the background. */
  stallMs: 30_000,
  /** After this long downloading, the person may open the app without waiting. */
  skipAfterMs: 15_000,
  /** The full bar stays a moment, so the step can be seen, before the app closes to install. */
  installLeadMs: 900,
};

/**
 * Before the room opens, the way Discord does it: ask for a new version, and
 * when there is one, download it and install it so the app opens already up
 * to date. Nothing ever keeps somebody out: no network, a failed check, a
 * stalled download, or a choice to skip all lead straight into the app, where
 * the usual notice still offers the update.
 */
export function updateBeforeLaunch(
  updates: LaunchUpdates,
  view: LaunchView,
  timing: typeof launchTiming = launchTiming,
): Promise<LaunchOutcome> {
  return new Promise((resolve) => {
    let done = false;
    let canSkip = false;
    let checkTimer: ReturnType<typeof setTimeout> | undefined;
    let stallTimer: ReturnType<typeof setTimeout> | undefined;
    let skipTimer: ReturnType<typeof setTimeout> | undefined;
    let last: Extract<LaunchScreen, { phase: 'downloading' }> | undefined;

    const finish = (outcome: LaunchOutcome) => {
      if (done) return;
      done = true;
      for (const timer of [checkTimer, stallTimer, skipTimer]) if (timer) clearTimeout(timer);
      stop();
      if (outcome === 'open') view.show({ phase: 'starting' });
      resolve(outcome);
    };

    const downloading = (status: Extract<UpdateStatus, { state: 'available' | 'downloading' }>) => {
      if (checkTimer) clearTimeout(checkTimer);
      checkTimer = undefined;
      skipTimer ??= setTimeout(() => {
        canSkip = true;
        if (last && !done) view.show({ ...last, canSkip });
      }, timing.skipAfterMs);
      if (stallTimer) clearTimeout(stallTimer);
      stallTimer = setTimeout(() => finish('open'), timing.stallMs);
      last =
        status.state === 'available'
          ? { phase: 'downloading', version: status.version, percent: 0, canSkip }
          : {
              phase: 'downloading',
              version: status.version ?? last?.version,
              percent: status.percent,
              transferred: status.transferred,
              total: status.total,
              bytesPerSecond: status.bytesPerSecond,
              canSkip,
            };
      view.show(last);
    };

    const react = (status: UpdateStatus) => {
      if (done) return;
      switch (status.state) {
        case 'available':
        case 'downloading':
          downloading(status);
          return;
        case 'downloaded':
          for (const timer of [checkTimer, stallTimer, skipTimer]) if (timer) clearTimeout(timer);
          view.show({ phase: 'installing', version: status.version });
          done = true;
          stop();
          setTimeout(() => {
            updates.install();
            resolve('installing');
          }, timing.installLeadMs);
          return;
        case 'not-available':
        case 'error':
          finish('open');
          return;
        default:
          return;
      }
    };

    const stop = updates.onStatus(react);
    view.onSkip(() => finish('open'));
    view.show({ phase: 'checking' });
    checkTimer = setTimeout(() => finish('open'), timing.checkMs);
    updates.check().then(react, () => finish('open'));
  });
}
