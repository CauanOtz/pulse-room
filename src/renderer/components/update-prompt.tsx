import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { ArrowRight, X } from 'lucide-react';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import appIconUrl from '../../../assets/app-icon.png';
import type { UpdateStatus } from '../../shared/desktop-api';
import { updateFlow } from './update-screen';
import { Tooltip } from './ui/tooltip';

const ease = [0.16, 1, 0.3, 1] as const;
/** How long the tick holds before the update screen takes the window. */
export const confirmHoldMs = 900;

/** Whether one dotted version comes after another: 0.10.0 after 0.9.9. */
export function isNewer(candidate: string, current: string): boolean {
  const parts = (version: string) =>
    version
      .split(/[.+-]/)
      .slice(0, 3)
      .map((part) => Number(part) || 0);
  const [a, b] = [parts(candidate), parts(current)];
  for (let index = 0; index < 3; index++) {
    if (a[index]! !== b[index]!) return a[index]! > b[index]!;
  }
  return false;
}

/** The version an update status is about, if it names one. */
const versionOf = (status?: UpdateStatus) =>
  status && 'version' in status && status.state !== 'not-available' ? status.version : undefined;

/** A version newer than this one, on its way or ready, as the updater reports it. */
export interface PendingUpdate {
  version: string;
  /** Downloaded and ready to install. */
  ready: boolean;
  /** How much of it has arrived, while it downloads. */
  progress?: number;
}

/** Follows the updater: the newer version it found, if any, and how far along it is. */
export function usePendingUpdate(current: string = __APP_VERSION__): PendingUpdate | undefined {
  const [status, setStatus] = useState<UpdateStatus>();
  // A download in progress may not repeat the version it is fetching.
  const known = useRef<string>(undefined);
  const named = versionOf(status);
  if (named) known.current = named;

  useEffect(() => {
    const updates = window.desktop?.updates;
    if (!updates) return undefined;
    void updates.current?.().then((now) => setStatus((seen) => seen ?? now));
    return updates.onStatus(setStatus);
  }, []);

  const pending =
    status?.state === 'available' || status?.state === 'downloading' || status?.state === 'downloaded';
  const next = pending ? (named ?? known.current) : undefined;
  if (!next || !isNewer(next, current)) return undefined;
  return {
    version: next,
    ready: status?.state === 'downloaded',
    progress: status?.state === 'downloading' ? Math.max(0, Math.min(100, status.percent)) : undefined,
  };
}

/**
 * A new version, said in a corner the moment it is known: which one is
 * running, which one is out, and a way to take it now. It can be closed;
 * the download carries on behind it either way, and it comes back for a
 * newer version or on the next launch.
 */
export function UpdatePrompt({ current = __APP_VERSION__ }: { current?: string }) {
  const update = usePendingUpdate(current);
  const [dismissed, setDismissed] = useState<string>();
  const [confirmed, setConfirmed] = useState(false);
  const flowing = useSyncExternalStore(updateFlow.subscribe, updateFlow.isRequested);
  const next = update?.version;
  const shown = Boolean(next && next !== dismissed && !flowing);

  useEffect(() => {
    if (!confirmed) return undefined;
    const timer = setTimeout(() => {
      updateFlow.start();
      setConfirmed(false);
    }, confirmHoldMs);
    return () => clearTimeout(timer);
  }, [confirmed]);

  const progress = update?.progress;
  const ready = update?.ready ?? false;

  return (
    <AnimatePresence>
      {shown && next && (
        <motion.aside
          key="update-prompt"
          className="update-prompt"
          role="dialog"
          aria-labelledby="update-prompt-title"
          aria-describedby="update-prompt-detail"
          initial={{ opacity: 0, y: 22, scale: 0.96, filter: 'blur(8px)' }}
          animate={{ opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' }}
          exit={{ opacity: 0, y: 14, scale: 0.97, filter: 'blur(6px)', transition: { duration: 0.32, ease } }}
          transition={{ duration: 0.6, ease }}
        >
          <header className="update-prompt-head">
            <img className="update-prompt-icon" src={appIconUrl} alt="" draggable={false} />
            <div className="update-prompt-heading">
              <h2 id="update-prompt-title">Update available</h2>
              <p id="update-prompt-detail">
                {ready
                  ? 'Downloaded and ready to install.'
                  : progress !== undefined
                    ? `Downloading in the background · ${Math.round(progress)}%`
                    : 'A new version of Pulse Room is out.'}
              </p>
            </div>
            <Tooltip label="Not now" side="top">
              <button
                type="button"
                className="update-prompt-close"
                aria-label="Close the update notice"
                onClick={() => setDismissed(next)}
              >
                <X size={14} />
              </button>
            </Tooltip>
          </header>

          <div className="update-prompt-versions" aria-label={`From version ${current} to version ${next}`}>
            <span className="update-prompt-version">
              <small>Current</small>v{current}
            </span>
            <ArrowRight className="update-prompt-arrow" size={14} aria-hidden="true" />
            <span className="update-prompt-version is-next">
              <small>New</small>v{next}
            </span>
          </div>

          <div className="update-prompt-actions">
            <button type="button" className="update-prompt-later" onClick={() => setDismissed(next)}>
              Later
            </button>
            <ConfirmButton confirmed={confirmed} onConfirm={() => setConfirmed(true)} />
          </div>

          {progress !== undefined && (
            <span className="update-prompt-progress" aria-hidden="true">
              <span style={{ transform: `scaleX(${progress / 100})` }} />
            </span>
          )}
        </motion.aside>
      )}
    </AnimatePresence>
  );
}

/**
 * A pill that folds into a circle and draws a tick when pressed, after
 * transitions.dev's button-to-success morph: the label blurs away, the width
 * closes in on a spring, and the check is drawn stroke by stroke.
 */
function ConfirmButton({ confirmed, onConfirm }: { confirmed: boolean; onConfirm(): void }) {
  const reduced = useReducedMotion();
  const spring = reduced
    ? { duration: 0 }
    : { type: 'spring' as const, stiffness: 420, damping: 34, mass: 0.9 };
  return (
    <motion.button
      type="button"
      layout
      className="update-prompt-confirm"
      data-confirmed={confirmed || undefined}
      aria-label={confirmed ? 'Updating' : 'Update now'}
      disabled={confirmed}
      onClick={onConfirm}
      transition={{ layout: spring }}
      whileTap={confirmed || reduced ? undefined : { scale: 0.96 }}
    >
      <AnimatePresence mode="popLayout" initial={false}>
        {confirmed ? (
          <motion.svg
            key="tick"
            className="update-prompt-tick"
            viewBox="0 0 24 24"
            aria-hidden="true"
            initial={{ opacity: 0, scale: 0.6, rotate: -12 }}
            animate={{ opacity: 1, scale: 1, rotate: 0 }}
            transition={
              reduced ? { duration: 0 } : { type: 'spring', stiffness: 520, damping: 26, delay: 0.08 }
            }
          >
            <motion.path
              d="M6 12.5 10.25 16.75 18 8.5"
              fill="none"
              stroke="currentColor"
              strokeWidth={2.4}
              strokeLinecap="round"
              strokeLinejoin="round"
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={reduced ? { duration: 0 } : { duration: 0.42, ease, delay: 0.16 }}
            />
          </motion.svg>
        ) : (
          <motion.span
            key="label"
            className="update-prompt-label"
            initial={{ opacity: 0, filter: 'blur(4px)' }}
            animate={{ opacity: 1, filter: 'blur(0px)' }}
            exit={{ opacity: 0, filter: 'blur(4px)', scale: 0.9, transition: { duration: 0.16 } }}
          >
            Update now
          </motion.span>
        )}
      </AnimatePresence>
      {confirmed && !reduced && <span className="update-prompt-ring" aria-hidden="true" />}
    </motion.button>
  );
}
