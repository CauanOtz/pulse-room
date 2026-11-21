import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import appIconUrl from '../../../assets/app-icon.png';
import type { FinishedUpdate, UpdateStatus } from '../../shared/desktop-api';
import LineWaves from './reactbits/line-waves';
import ShinyText from './reactbits/shiny-text';
import StatusMark, { type StatusMarkStatus } from './reactbits/status-mark';

/*
 * Asking for an update and drawing it are kept apart: the button lives in
 * settings, deep inside a signed-in workspace, and the screen covers the
 * whole window, whatever is on it.
 */
let requested = false;
const listeners = new Set<() => void>();
const announce = () => listeners.forEach((listener) => listener());

export const updateFlow = {
  /** Covers the window and sees the update through: download, install, restart. */
  start(): void {
    requested = true;
    announce();
  },
  cancel(): void {
    requested = false;
    announce();
  },
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  isRequested: () => requested,
};

/** How long the bar takes to fill once the download is done, so the step can be seen. */
export const installLeadMs = 1_100;
/** How long the screen stays after a restart, to say the update landed. */
export const finishedHoldMs = 1_900;

type Phase =
  | { kind: 'downloading'; percent: number; version?: string; rate?: number }
  | { kind: 'installing'; version: string }
  | { kind: 'failed'; message: string }
  | { kind: 'finished'; update: FinishedUpdate };

function phaseOf(status: UpdateStatus | undefined): Phase {
  switch (status?.state) {
    case 'downloaded':
      return { kind: 'installing', version: status.version };
    case 'downloading':
      return { kind: 'downloading', percent: status.percent, version: status.version, rate: status.bytesPerSecond };
    case 'available':
      return { kind: 'downloading', percent: 0, version: status.version };
    case 'error':
      return { kind: 'failed', message: status.message };
    default:
      return { kind: 'downloading', percent: 0 };
  }
}

function rateOf(bytesPerSecond: number | undefined): string | undefined {
  if (!bytesPerSecond || bytesPerSecond <= 0) return undefined;
  const megabytes = bytesPerSecond / 1_048_576;
  return megabytes >= 1 ? `${megabytes.toFixed(1)} MB/s` : `${Math.round(bytesPerSecond / 1024)} KB/s`;
}

const isLight = () => document.documentElement.classList.contains('theme-light');

export function UpdateScreen() {
  const active = useSyncExternalStore(updateFlow.subscribe, updateFlow.isRequested);
  const [status, setStatus] = useState<UpdateStatus>();
  const [finished, setFinished] = useState<FinishedUpdate | null>(null);
  const installing = useRef(false);

  useEffect(() => {
    const updates = window.desktop?.updates;
    if (!updates) return undefined;
    void updates.current?.().then((current) => setStatus((known) => known ?? current));
    void updates.finished?.().then((done) => done && setFinished(done));
    return updates.onStatus(setStatus);
  }, []);

  // A restart that just installed an update says so, then steps aside.
  useEffect(() => {
    if (!finished) return undefined;
    const timer = setTimeout(() => setFinished(null), finishedHoldMs);
    return () => clearTimeout(timer);
  }, [finished]);

  const phase: Phase | undefined = finished
    ? { kind: 'finished', update: finished }
    : active
      ? phaseOf(status)
      : undefined;

  // Once the download is in, the bar fills, and then the app hands over to
  // the installer, which closes it and opens the new version.
  useEffect(() => {
    if (phase?.kind !== 'installing' || installing.current) return undefined;
    installing.current = true;
    const timer = setTimeout(() => void window.desktop?.updates.install(), installLeadMs);
    return () => clearTimeout(timer);
  }, [phase?.kind]);

  useEffect(() => {
    if (phase?.kind === 'failed') installing.current = false;
  }, [phase?.kind]);

  return (
    <AnimatePresence>
      {phase && (
        <motion.div
          key="update-screen"
          className="update-screen"
          role="dialog"
          aria-modal="true"
          aria-labelledby="update-screen-title"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.5, ease: [0.16, 1, 0.3, 1] } }}
          transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
        >
          <UpdateBackdrop phase={phase.kind} />
          <UpdateContent phase={phase} />
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/**
 * Fine lines drifting under a moving band of light, React Bits' Line Waves,
 * kept to the theme's ink and turned down so the words sit on top of it. The
 * lines quicken while the new version goes in and settle once it is there.
 */
function UpdateBackdrop({ phase }: { phase: Phase['kind'] }) {
  const [light] = useState(isLight);
  return (
    <div className="update-backdrop" aria-hidden="true">
      <LineWaves
        color1={light ? '#000000' : '#ffffff'}
        color2={light ? '#3a3a3a' : '#c8c8cc'}
        color3={light ? '#6a6a72' : '#8a8a92'}
        lightMode={light}
        speed={phase === 'installing' ? 0.55 : phase === 'finished' ? 0.12 : 0.28}
        lineCount={44}
        lineWidth={1}
        glow={light ? 0.2 : 0.5}
        brightness={light ? 0.85 : 0.9}
        opacity={phase === 'failed' ? 0.35 : light ? 0.7 : 0.8}
        rotation={-28}
        edgeFade={0}
        enableMouseInteraction={false}
        clickRipple={false}
        maxDevicePixelRatio={1.5}
      />
    </div>
  );
}

const markOf: Record<Phase['kind'], StatusMarkStatus> = {
  downloading: 'running',
  installing: 'running',
  finished: 'done',
  failed: 'failed',
};

const titleOf: Record<Phase['kind'], string> = {
  downloading: 'Updating',
  installing: 'Installing',
  finished: 'Updated',
  failed: 'Update failed',
};

function UpdateContent({ phase }: { phase: Phase }) {
  const [light] = useState(isLight);
  const percent =
    phase.kind === 'downloading' ? Math.max(0, Math.min(100, phase.percent)) : phase.kind === 'failed' ? 0 : 100;
  const title = titleOf[phase.kind];
  const version =
    phase.kind === 'finished'
      ? phase.update.to
      : phase.kind === 'installing' || phase.kind === 'downloading'
        ? phase.version
        : undefined;
  const detail =
    phase.kind === 'finished'
      ? `From ${phase.update.from} to ${phase.update.to}. Everything is where you left it.`
      : phase.kind === 'installing'
        ? 'Pulse Room will close for a moment and open again by itself.'
        : phase.kind === 'failed'
          ? phase.message
          : 'Downloading the new version. Your call and chats stay as they are until it restarts.';
  const meta =
    phase.kind === 'downloading'
      ? (rateOf(phase.rate) ?? 'Starting')
      : phase.kind === 'installing'
        ? 'Restarting'
        : phase.kind === 'finished'
          ? 'Ready'
          : 'Stopped';
  const working = phase.kind === 'downloading' || phase.kind === 'installing';
  const ink = light ? '#0a0a0a' : '#ffffff';

  return (
    <motion.div
      className="update-card"
      data-phase={phase.kind}
      initial={{ opacity: 0, y: 18, scale: 0.97, filter: 'blur(8px)' }}
      animate={{ opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' }}
      exit={{ opacity: 0, y: -10, scale: 0.99, filter: 'blur(6px)' }}
      transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1], delay: 0.08 }}
    >
      <div className="update-mark" aria-hidden="true">
        <img src={appIconUrl} alt="" draggable={false} />
      </div>

      <div className="update-heading">
        <h2 id="update-screen-title">
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.span
              key={title}
              className="update-title"
              initial={{ opacity: 0, y: 12, filter: 'blur(6px)' }}
              animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
              exit={{ opacity: 0, y: -12, filter: 'blur(6px)' }}
              transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
            >
              {/* Shiny Text: a band of light runs across the word while the work goes on. */}
              <ShinyText
                text={title}
                color={working ? (light ? '#55555c' : '#9a9aa2') : ink}
                shineColor={ink}
                speed={1.8}
                delay={0.3}
                shineWidth={36}
                glow={light ? 0 : 0.35}
                disabled={!working}
              />
            </motion.span>
          </AnimatePresence>
        </h2>
        {version && <span className="update-version">v{version}</span>}
      </div>

      <div
        className="update-progress"
        role="progressbar"
        aria-label="Update progress"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
      >
        <span className="update-progress-fill" style={{ transform: `scaleX(${percent / 100})` }}>
          <span className="update-progress-glint" />
        </span>
      </div>

      <div className="update-readout">
        {/* Status Mark: a turning arc while it works, drawn shut with a check once it is done. */}
        <span className="update-meta">
          <StatusMark
            status={markOf[phase.kind]}
            progress={phase.kind === 'downloading' && percent > 0 ? percent / 100 : undefined}
            color={ink}
            doneColor={ink}
            errorColor={ink}
            size={13}
            strokeWidth={2.2}
            fontSize={11}
            label={meta}
            strike={false}
          />
        </span>
        <span className="update-percent">
          <RollingNumber value={percent} />
          <span className="update-percent-sign">%</span>
        </span>
      </div>

      <p className="update-detail">{detail}</p>

      {(phase.kind === 'downloading' || phase.kind === 'failed') && (
        <button className="update-dismiss" type="button" onClick={updateFlow.cancel}>
          {phase.kind === 'failed' ? 'Close' : 'Keep downloading in the background'}
        </button>
      )}
    </motion.div>
  );
}

const digits = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];

/**
 * The percentage as rolling digits, each on a drum of its own that turns to
 * the next figure, after transitions.dev's spinning counter. Three drums
 * always, the leading ones folding away while they would read zero.
 */
function RollingNumber({ value }: { value: number }) {
  const text = String(Math.round(value)).padStart(3, ' ');
  return (
    <span className="update-number" data-value={Math.round(value)}>
      {[...text].map((character, index) => {
        const blank = character === ' ';
        const digit = blank ? 0 : Number(character);
        return (
          <span className="update-drum" data-blank={blank || undefined} key={index} aria-hidden="true">
            <span className="update-drum-strip" style={{ transform: `translateY(${-digit * 10}%)` }}>
              {digits.map((each) => (
                <span key={each}>{each}</span>
              ))}
            </span>
          </span>
        );
      })}
      <span className="sr-only">{Math.round(value)}</span>
    </span>
  );
}
