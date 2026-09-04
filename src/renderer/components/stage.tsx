import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Headphones, Maximize2, Minimize2, MonitorUp, Radio, ShieldCheck, Volume2 } from 'lucide-react';
import type { Participant } from '../domain/conference';
import { MediaOutput } from './media-output';
import { cn } from './ui/utils';
import { ParticipantTiles } from './participant-tiles';

interface StageProps {
  participants: Participant[];
  joined: boolean;
  speakerDeviceId?: string;
  expandLevels?: boolean;
  avatars?: ReadonlyMap<string, string | null | undefined>;
  /** The call controls, which ride along with the fading overlay. */
  children?: ReactNode;
}

export function Stage({
  participants,
  joined,
  speakerDeviceId,
  expandLevels,
  avatars,
  children,
}: StageProps) {
  const broadcasts = participants.filter((participant) => participant.screenStream);
  // Undefined follows the room; null is a viewer who stepped back to the grid.
  const [focusRequest, setFocusRequest] = useState<string | null>();
  // Showing your own monitor on the monitor being captured feeds the capture
  // back into itself, so a friend's screen is the better default view.
  const suggested = broadcasts.find((broadcast) => !broadcast.isLocal) ?? broadcasts[0];
  const active =
    focusRequest === null
      ? undefined
      : broadcasts.find((broadcast) => broadcast.id === focusRequest) ?? suggested;

  const stageRef = useRef<HTMLElement>(null);
  const [fullScreen, setFullScreen] = useState(false);
  // Screen audio carries games and music, so it needs its own level, apart from
  // the voice volume of the person sharing.
  const [screenVolumes, setScreenVolumes] = useState<Record<string, number>>({});
  // Screen audio arrives at the level the sender's machine was playing it, so
  // half volume leaves room to push a quiet stream well past its own level.
  const screenVolume = active ? screenVolumes[active.id] ?? 50 : 50;
  // The controls sit over the picture, so they step aside while nobody reaches
  // for them, the way a video player does.
  const [controlsVisible, setControlsVisible] = useState(true);
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
    if (!active && document.fullscreenElement) {
      void document.exitFullscreen().catch(() => undefined);
    }
  }, [active]);

  const focus = (participant: Participant) => {
    if (!participant.screenStream) return;
    setFocusRequest(participant.id === activeId ? null : participant.id);
  };

  if (!joined) {
    return (
      <section className="stage stage-empty relative flex size-full flex-col items-center justify-center overflow-hidden rounded-lg bg-stage p-8 text-center" ref={stageRef}>
        <div className="stage-symbol mb-4 grid size-13 place-items-center rounded-full bg-secondary text-primary"><Radio size={22} /></div>
        <h1>Come as you are</h1>
        <p>A quiet place for loud nights. Pick a voice channel on the left to join.</p>
        <div className="stage-facts flex flex-wrap justify-center gap-4 text-xs text-muted-foreground [&>span]:flex [&>span]:items-center [&>span]:gap-1.5">
          <span><ShieldCheck size={16} /> Noise suppression</span>
          <span><Headphones size={16} /> Separate volumes</span>
          <span><MonitorUp size={16} /> 1080p screen audio</span>
        </div>
      </section>
    );
  }

  if (!active?.screenStream) {
    return (
      <section className="stage stage-room relative flex size-full flex-col overflow-hidden rounded-lg bg-stage" ref={stageRef}>
        <ParticipantTiles avatars={avatars} participants={participants} layout="grid" onFocus={focus} />
        {/* The controls belong under the middle of the room, not against its edge. */}
        <div className="live-overlay flex flex-col items-center gap-2 px-3 pb-3">{children}</div>
      </section>
    );
  }

  return (
    <section
      className={cn(
        'stage stage-live relative size-full overflow-hidden rounded-lg bg-stage',
        !controlsVisible && 'is-idle cursor-none',
      )}
      ref={stageRef}
      onMouseMove={revealControls}
      onMouseLeave={() => setControlsVisible(false)}
      onFocusCapture={holdControls}
    >
      <div
        className={cn(
            'live-toolbar absolute inset-x-0 top-0 z-2 flex items-center justify-between gap-3 px-3 py-2.5 transition-opacity duration-200',
            'bg-gradient-to-b from-black/85 via-black/55 to-transparent',
            controlsVisible ? 'opacity-100' : 'is-hidden pointer-events-none opacity-0',
          )}
        onMouseEnter={holdControls}
        onMouseMove={holdControls}
      >
        <div className="live-source flex min-w-0 items-center gap-2 truncate text-xs font-medium text-foreground">
          <span className="live-pulse size-2 shrink-0 rounded-full bg-destructive shadow-[0_0_0_4px] shadow-destructive/20" /> Live from {active.isLocal ? 'your screen' : active.name}
        </div>

        <div className="live-tools flex items-center gap-3">
          {!active.isLocal && (
            <label className="live-volume flex items-center gap-2 text-xs text-muted-foreground">
              <Volume2 size={15} />
              <input
                aria-label={`${active.name} screen volume`}
                type="range"
                min="0"
                max="200"
                value={screenVolume}
                onChange={(event) =>
                  setScreenVolumes((volumes) => ({ ...volumes, [active.id]: Number(event.target.value) }))
                }
              />
              <span>{screenVolume}%</span>
            </label>
          )}

          <button
            className="live-action inline-flex items-center gap-2 rounded-lg border border-border bg-card/80 px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-accent"
            type="button"
            onClick={toggleFullScreen}
            aria-label={fullScreen ? 'Exit full screen' : 'Enter full screen'}
          >
            {fullScreen ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
            <span>{fullScreen ? 'Exit' : 'Full screen'}</span>
          </button>
        </div>
      </div>

      <div className="live-surface absolute inset-0 flex bg-stage" onDoubleClick={toggleFullScreen}>
        <MediaOutput
          key={active.id}
          stream={active.screenStream}
          muted={active.isLocal}
          speakerDeviceId={speakerDeviceId}
          video
          className={expandLevels ? 'screen-video is-expanded' : 'screen-video'}
          volume={screenVolume}
        />
      </div>

      <div
        className={cn(
            'live-overlay pointer-events-none absolute inset-x-0 bottom-0 z-2 flex flex-col items-center gap-2 p-3 transition-opacity duration-200',
            '[&_*]:pointer-events-auto',
            controlsVisible ? 'opacity-100' : 'is-hidden opacity-0 [&_*]:pointer-events-none',
          )}
        onMouseEnter={holdControls}
        onMouseMove={holdControls}
      >
        <ParticipantTiles
          avatars={avatars}
          participants={participants}
          focusedId={active.id}
          layout="strip"
          onFocus={focus}
        />
        {children}
      </div>
    </section>
  );
}
