import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import {
  ArrowLeft,
  ExternalLink,
  Headphones,
  LayoutGrid,
  PanelRightClose,
  PanelRightOpen,
  Maximize2,
  Minimize2,
  MonitorUp,
  Radio,
  ShieldCheck,
  Square,
  SquareStack,
  Volume2,
} from 'lucide-react';
import { motion } from 'motion/react';
import type { Participant } from '../domain/conference';
import type { StreamHealth } from '../domain/stream-health';
import { MediaOutput } from './media-output';
import { StreamHealthIndicator } from './stream-health';
import { CallTimer } from './call-timer';
import { LiveStreamNavigation, LiveVoicePeers } from './live-stream-navigation';
import { cn } from './ui/utils';
import { ParticipantTiles } from './participant-tiles';
import { Tooltip } from './ui/tooltip';
import { useSteadySpeaker } from './steady-speaker';
import { VoiceWaveform } from './voice-waveform';
import {
  openLiveWindow,
  openLiveWindowIds,
  subscribeLiveWindows,
  updateLiveWindow,
} from '../infrastructure/media/live-windows';

const noWindows: string[] = [];

/** One empty list, so "nobody is being watched" is the same value each time. */
const nobody: string[] = [];

interface StageProps {
  participants: Participant[];
  joined: boolean;
  speakerDeviceId?: string;
  expandLevels?: boolean;
  avatars?: ReadonlyMap<string, string | null | undefined>;
  /** Whose screens this client asked for. More than one may be running. */
  watching?: string[];
  onWatch(participantId: string, watching: boolean): void;
  /** A right click on somebody in the room. */
  onOptions?(participant: Participant, position: { x: number; y: number }): void;
  /** The sound of each screen, which plays whether or not it is being watched. */
  screenVolumes?: Record<string, number>;
  onScreenVolume?(participantId: string, volume: number): void;
  /** How a shared screen is doing, from wherever this machine can see it. */
  readStream?(participantId: string): Promise<StreamHealth | undefined>;
  /** When the call in this room began, for the timer at the top of the room. */
  callSince?: number;
  /** The call controls, which ride along with the fading overlay. */
  children?: ReactNode;
}

export function Stage({
  participants,
  joined,
  speakerDeviceId,
  expandLevels,
  avatars,
  watching,
  onWatch,
  onOptions,
  screenVolumes,
  onScreenVolume,
  readStream,
  callSince,
  children,
}: StageProps) {
  const broadcasts = participants.filter((participant) => participant.isBroadcasting);
  // Nobody is shown a screen they did not ask for: decoding one is the most
  // expensive thing in the room, and not every machine here can spare it. Two
  // can be taken at once, which is how a room watches two people play.
  const watched = watching ?? nobody;
  // One of the screens taken fills the room, and by default that is simply the
  // first of them. Putting the picture away is not the same as leaving the
  // stream: the room comes back, every stream taken keeps running in its tile,
  // and only the menu on a tile hangs up on one.
  const [openId, setOpenId] = useState<string>();
  const [closed, setClosed] = useState(false);
  const available = (id: string) => broadcasts.some((broadcast) => broadcast.id === id);
  const openedId = openId && watched.includes(openId) && available(openId) ? openId : watched.find(available);
  const active = closed ? undefined : broadcasts.find((broadcast) => broadcast.id === openedId);
  const picture = active?.screenStream?.getVideoTracks().length ? active.screenStream : undefined;
  // Every screen this client took and can draw, for watching them side by side.
  const received = broadcasts.filter(
    (broadcast) => watched.includes(broadcast.id) && broadcast.screenStream?.getVideoTracks().length,
  );
  const [sideBySide, setSideBySide] = useState(false);
  // The list of other screens folds away, so a live can fill the room
  // without being popped out into a window of its own.
  const [railOpen, setRailOpen] = useState(() => {
    try {
      return window.localStorage.getItem('pulse-room:stream-rail') !== 'closed';
    } catch {
      return true;
    }
  });
  const toggleRail = () =>
    setRailOpen((open) => {
      try {
        window.localStorage.setItem('pulse-room:stream-rail', open ? 'closed' : 'open');
      } catch {
        // Kept for this session only.
      }
      return !open;
    });
  const mosaic = sideBySide && received.length > 1;

  // Screens popped out into windows follow the person: a new stream replaces
  // the old one, and an ended live says so instead of freezing.
  const poppedOut = useSyncExternalStore(subscribeLiveWindows, openLiveWindowIds, () => noWindows);
  useEffect(() => {
    for (const id of poppedOut) {
      const person = participants.find((participant) => participant.id === id);
      const stream =
        person?.isBroadcasting && watched.includes(id) && person.screenStream?.getVideoTracks().length
          ? person.screenStream
          : undefined;
      updateLiveWindow(id, person?.name ?? 'Live', stream);
    }
  }, [participants, poppedOut, watched]);
  const popOut = useCallback((participant: Participant) => {
    const stream = participant.screenStream;
    if (stream?.getVideoTracks().length) openLiveWindow(participant.id, participant.name, stream);
  }, []);

  const open = useCallback((participantId: string) => {
    setOpenId(participantId);
    setClosed(false);
  }, []);

  const stageRef = useRef<HTMLElement>(null);
  const { speaker, last: lastSpeaker } = useSteadySpeaker(participants);
  const featured =
    speaker ??
    lastSpeaker ??
    participants.find((person) => person.isLocal) ??
    participants[0];
  const [fullScreen, setFullScreen] = useState(false);
  // Screen audio arrives at the level the sender's machine was playing it, so
  // half volume leaves room to push a quiet stream well past its own level.
  const screenVolume = active ? (screenVolumes?.[active.id] ?? 50) : 50;
  // The controls sit over the picture, so they step aside while nobody reaches
  // for them, the way a video player does.
  const [controlsShown, setControlsShown] = useState(true);
  // Reading the stream's health is reaching for the controls, for as long as it lasts.
  const [inspecting, setInspecting] = useState(false);
  const controlsVisible = controlsShown || inspecting;
  const setControlsVisible = setControlsShown;
  const hideTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const revealControls = useCallback(() => {
    setControlsVisible(true);
    clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setControlsVisible(false), 2_600);
  }, []);

  const holdControls = useCallback(() => {
    setControlsVisible(true);
    clearTimeout(hideTimer.current);
  }, []);

  useEffect(() => () => clearTimeout(hideTimer.current), []);

  // A screen that has just gone live shows its controls, then lets them fade.
  const activeId = active?.id;
  useEffect(() => {
    if (activeId) revealControls();
  }, [activeId, revealControls]);

  useEffect(() => {
    const handleChange = () => setFullScreen(document.fullscreenElement === stageRef.current);
    document.addEventListener('fullscreenchange', handleChange);
    return () => document.removeEventListener('fullscreenchange', handleChange);
  }, []);

  const toggleFullScreen = useCallback(() => {
    const element = stageRef.current;
    if (!element) return;
    if (document.fullscreenElement) {
      void document.exitFullscreen().catch(() => undefined);
    } else {
      void element.requestFullscreen?.().catch(() => undefined);
    }
  }, []);

  // Nothing is left to enlarge once the broadcast ends.
  useEffect(() => {
    if (!picture && document.fullscreenElement) {
      void document.exitFullscreen().catch(() => undefined);
    }
  }, [picture]);

  const focus = useCallback(
    (participant: Participant) => {
      if (!participant.isBroadcasting) return;
      if (!watched.includes(participant.id)) onWatch(participant.id, true);
      // Choosing a view never leaves another stream, including one still
      // connecting. Unsubscribing belongs to the explicit Stop watching action.
      open(participant.id);
    },
    [onWatch, open, watched],
  );

  if (!joined) {
    return (
      <section
        className="stage stage-empty relative flex size-full flex-col items-center justify-center overflow-hidden rounded-xl border border-border bg-stage p-8 text-center shadow-[var(--gloss)]"
        ref={stageRef}
      >
        <div className="stage-symbol mb-4 grid size-12 place-items-center rounded-xl border border-border bg-secondary text-primary shadow-[var(--gloss)]">
          <Radio size={20} />
        </div>
        <h1>Come as you are</h1>
        <p>A quiet place for loud nights. Pick a voice channel on the left to join.</p>
        <div className="stage-facts flex flex-wrap justify-center gap-4 text-xs text-muted-foreground [&>span]:flex [&>span]:items-center [&>span]:gap-1.5">
          <span>
            <ShieldCheck size={16} /> Noise suppression
          </span>
          <span>
            <Headphones size={16} /> Separate volumes
          </span>
          <span>
            <MonitorUp size={16} /> 1080p screen audio
          </span>
        </div>
      </section>
    );
  }

  if (!active || !picture) {
    return (
      <section
        className={cn(
          'stage stage-room relative flex size-full flex-col overflow-hidden rounded-xl border border-border bg-stage shadow-[var(--gloss)]',
          fullScreen && 'is-fullscreen',
        )}
        ref={stageRef}
      >
        <div className="voice-session-meta">
          <span>
            <Radio size={13} aria-hidden="true" /> Voice room
          </span>
          <span className="voice-session-count">
            {participants.length} connected
            {callSince && (
              <>
                <i aria-hidden="true" />
                <CallTimer since={callSince} className="voice-session-timer" />
              </>
            )}
          </span>
        </div>
        <button
          className="voice-expand"
          type="button"
          onClick={toggleFullScreen}
          aria-label={fullScreen ? 'Exit full screen' : 'Enter full screen'}
        >
          {fullScreen ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
        </button>
        <ParticipantTiles
          avatars={avatars}
          participants={participants}
          watching={watched}
          layout="spotlight"
          featuredId={featured?.id}
          information={
            <header className={cn('voice-room-heading', speaker && 'is-speaking')}>
              <p>{speaker ? 'Speaking' : featured ? 'In the room' : 'Joining voice'}</p>
              <h2 title={featured?.name}>{featured?.name ?? 'Connecting…'}</h2>
              <span className="voice-room-caption">
                {speaker
                  ? 'Microphone on'
                  : featured?.isMuted
                    ? 'Microphone muted'
                    : 'Listening to the conversation'}
              </span>
              {speaker?.microphoneStream && (
                <VoiceWaveform stream={speaker.microphoneStream} name={speaker.name} />
              )}
            </header>
          }
          onFocus={focus}
          onOptions={onOptions}
        />
        {/* The controls belong under the middle of the room, not against its edge. */}
        <div className="live-overlay flex flex-col items-center gap-2 px-3 pb-3">{children}</div>
      </section>
    );
  }

  return (
    <section
      className={cn(
        'stage stage-live live-workspace relative size-full overflow-hidden rounded-xl border border-border bg-stage shadow-[var(--gloss)]',
        broadcasts.length > 1 && !mosaic && 'has-stream-navigation',
        !railOpen && 'is-rail-closed',
        mosaic && 'is-mosaic',
        fullScreen && 'is-fullscreen',
        !controlsVisible && 'is-idle cursor-none',
      )}
      ref={stageRef}
      onMouseMove={revealControls}
      onMouseLeave={() => setControlsVisible(false)}
      onFocusCapture={holdControls}
    >
      <div
        className={cn(
          'live-toolbar z-2 flex items-center justify-between gap-3 px-4 py-3 transition-opacity duration-200',
          controlsVisible ? 'opacity-100' : 'is-hidden pointer-events-none opacity-0',
        )}
        onMouseEnter={holdControls}
        onMouseMove={holdControls}
      >
        <div className="live-source flex min-w-0 items-center gap-2 truncate text-xs font-medium text-foreground">
          <span className="live-pulse" aria-hidden="true" />
          {mosaic ? (
            <>
              <SquareStack size={15} aria-hidden="true" /> {received.length} screens side by side
            </>
          ) : (
            <>
              <MonitorUp size={15} aria-hidden="true" />
              <span className="min-w-0 truncate">
                Live from {active.isLocal ? 'your screen' : active.name}
              </span>
              {readStream && (
                <StreamHealthIndicator participant={active} read={readStream} onOpenChange={setInspecting} />
              )}
            </>
          )}
        </div>

        <div className="live-tools flex items-center gap-2">
          {!active.isLocal && (
            <label className="live-volume flex items-center gap-2 text-xs text-muted-foreground">
              <Volume2 size={15} />
              <input
                aria-label={`${active.name} screen volume`}
                style={{ ['--range-progress' as string]: `${screenVolume / 2}%` }}
                type="range"
                min="0"
                max="200"
                value={screenVolume}
                onChange={(event) => onScreenVolume?.(active.id, Number(event.target.value))}
              />
              <span>{screenVolume}%</span>
            </label>
          )}
          <span className="live-tools-rule" aria-hidden="true" />
          {broadcasts.length > 1 && !mosaic && (
            <Tooltip label={railOpen ? 'Hide the stream list' : 'Show the stream list'} side="bottom">
              <button
                className="live-action is-icon"
                type="button"
                aria-label={railOpen ? 'Hide the stream list' : 'Show the stream list'}
                aria-pressed={!railOpen}
                onClick={toggleRail}
              >
                {railOpen ? <PanelRightClose size={16} /> : <PanelRightOpen size={16} />}
              </button>
            </Tooltip>
          )}
          {received.length > 1 && (
            <Tooltip label={mosaic ? 'One at a time' : 'Side by side'} side="bottom">
              <button
                className="live-action is-icon"
                type="button"
                aria-label={mosaic ? 'One at a time' : 'Side by side'}
                aria-pressed={mosaic}
                onClick={() => setSideBySide(!mosaic)}
              >
                <LayoutGrid size={16} />
              </button>
            </Tooltip>
          )}
          {!mosaic && (
            <Tooltip label="Open in a new window" side="bottom">
              <button
                className="live-action is-icon"
                type="button"
                aria-label={`Open ${active.isLocal ? 'your screen' : active.name} in a window`}
                onClick={() => popOut(active)}
              >
                <ExternalLink size={16} />
              </button>
            </Tooltip>
          )}
          <Tooltip
            label={fullScreen ? 'Exit full screen' : 'Full screen'}
            shortcut="Double-click"
            side="bottom"
          >
            <button
              className="live-action is-icon"
              type="button"
              onClick={toggleFullScreen}
              aria-label={fullScreen ? 'Exit full screen' : 'Enter full screen'}
            >
              {fullScreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
            </button>
          </Tooltip>
          <Tooltip label="Stop watching" side="bottom">
            <button
              className="live-action live-stop is-icon"
              type="button"
              aria-label={`Stop watching ${active.name}`}
              onClick={() => onWatch(active.id, false)}
              onContextMenu={(event) => {
                if (!onOptions || active.isLocal) return;
                event.preventDefault();
                onOptions(active, { x: event.clientX, y: event.clientY });
              }}
            >
              <Square size={14} />
            </button>
          </Tooltip>
          <Tooltip label="Back to the room" side="bottom">
            <button
              className="live-action is-icon"
              type="button"
              onClick={() => setClosed(true)}
              aria-label="Back to the room"
            >
              <ArrowLeft size={16} />
            </button>
          </Tooltip>
        </div>
      </div>

      <div className="live-player-body">
        {mosaic ? (
          <div className="live-mosaic" data-count={Math.min(received.length, 4)}>
            {received.map((person) => (
              <figure key={person.id} className="live-mosaic-cell">
                <button
                  type="button"
                  className="live-mosaic-picture"
                  aria-label={`Show only ${person.name}`}
                  onClick={() => {
                    setSideBySide(false);
                    open(person.id);
                  }}
                  onContextMenu={(event) => {
                    if (!onOptions || person.isLocal) return;
                    event.preventDefault();
                    onOptions(person, { x: event.clientX, y: event.clientY });
                  }}
                >
                  <MediaOutput
                    stream={person.screenStream}
                    muted
                    video
                    label={`${person.name} screen`}
                    className={expandLevels ? 'screen-video is-expanded' : 'screen-video'}
                  />
                </button>
                <figcaption>
                  <span className="live-dot" aria-hidden="true" />
                  <span className="min-w-0 truncate">{person.isLocal ? 'Your screen' : person.name}</span>
                  <button
                    type="button"
                    className="live-mosaic-tool"
                    aria-label={`Open ${person.name} in a window`}
                    onClick={() => popOut(person)}
                  >
                    <ExternalLink size={13} />
                  </button>
                </figcaption>
              </figure>
            ))}
          </div>
        ) : (
          <div className="live-surface flex bg-stage" onDoubleClick={toggleFullScreen}>
            <MediaOutput
              key={active.id}
              stream={picture}
              // The room plays the sound of a screen, so this element never does:
              // one owner means leaving a stream cannot take its music away.
              muted
              speakerDeviceId={speakerDeviceId}
              video
              className={expandLevels ? 'screen-video is-expanded' : 'screen-video'}
            />
          </div>
        )}
        {broadcasts.length > 1 && !mosaic && (
          <motion.div
            className="live-rail"
            initial={false}
            animate={{ width: railOpen ? 'auto' : 0, opacity: railOpen ? 1 : 0 }}
            transition={{ duration: 0.42, ease: [0.16, 1, 0.3, 1] }}
            aria-hidden={!railOpen || undefined}
            inert={!railOpen || undefined}
          >
            <LiveStreamNavigation
              participants={broadcasts}
              watching={watched}
              activeId={active.id}
              avatars={avatars}
              onSelect={focus}
              onStop={(id) => onWatch(id, false)}
              onOptions={onOptions}
            />
          </motion.div>
        )}
      </div>

      <div
        className={cn(
          'live-overlay live-player-footer z-2 transition-opacity duration-200',
          '[&_*]:pointer-events-auto',
          controlsVisible ? 'opacity-100' : 'is-hidden opacity-0 [&_*]:pointer-events-none',
        )}
        onMouseEnter={holdControls}
        onMouseMove={holdControls}
      >
        <LiveVoicePeers
          participants={participants.filter((person) => !person.isBroadcasting)}
          avatars={avatars}
          onOptions={onOptions}
        />
        <div className="live-player-controls">{children}</div>
      </div>
    </section>
  );
}
