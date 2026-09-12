import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Headphones, Maximize2, Minimize2, MonitorUp, Radio, ShieldCheck, Tv, Volume2, X } from 'lucide-react';
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
  /** Whose screen this client asked for, if anyone's. */
  watching?: string;
  onWatch(participantId?: string): void;
  /** A right click on somebody in the room. */
  onOptions?(participant: Participant, position: { x: number; y: number }): void;
  /** The sound of each screen, which plays whether or not it is being watched. */
  screenVolumes?: Record<string, number>;
  onScreenVolume?(participantId: string, volume: number): void;
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
  children,
}: StageProps) {
  const broadcasts = participants.filter((participant) => participant.isBroadcasting);
  // Nobody is shown a screen they did not ask for: decoding one is the most
  // expensive thing in the room, and not every machine here can spare it.
  const watched = broadcasts.find((broadcast) => broadcast.id === watching);
  // Putting the picture away is not the same as leaving the stream. The room
  // comes back, the stream keeps running in its tile, and only the menu on that
  // tile hangs up on it.
  const [minimised, setMinimised] = useState(false);
  const active = minimised ? undefined : watched;
  const picture = active?.screenStream?.getVideoTracks().length ? active.screenStream : undefined;

  // A different screen, or a new one, is something to look at.
  useEffect(() => setMinimised(false), [watching]);

  const stageRef = useRef<HTMLElement>(null);
  const [fullScreen, setFullScreen] = useState(false);
  // Screen audio arrives at the level the sender's machine was playing it, so
  // half volume leaves room to push a quiet stream well past its own level.
  const screenVolume = active ? screenVolumes?.[active.id] ?? 50 : 50;
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
    if (!picture && document.fullscreenElement) {
      void document.exitFullscreen().catch(() => undefined);
    }
  }, [picture]);

  const focus = (participant: Participant) => {
    if (!participant.isBroadcasting) return;
    if (participant.id !== watching) {
      setMinimised(false);
      onWatch(participant.id);
      return;
    }
    // Already the one being watched: this is about the picture, not the stream.
    setMinimised((away) => !away);
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

  if (!active || !picture) {
    return (
      <section className="stage stage-room relative flex size-full flex-col overflow-hidden rounded-lg bg-stage" ref={stageRef}>
        {broadcasts.length > 0 && (
          <div className="live-offers flex flex-none flex-wrap items-center justify-center gap-2 px-3 pt-3">
            {broadcasts.map((broadcast) => (
              <div
                className="live-offer flex items-center gap-3 rounded-xl border border-border bg-card/80 px-3 py-2 text-sm"
                key={broadcast.id}
              >
                <span className="live-pulse size-2 shrink-0 rounded-full bg-destructive shadow-[0_0_0_4px] shadow-destructive/20" />
                <span className="min-w-0 truncate">
                  {watching === broadcast.id
                    ? `Watching ${broadcast.isLocal ? 'your screen' : broadcast.name}`
                    : broadcast.isLocal
                      ? 'Your screen is live'
                      : `${broadcast.name} is sharing a screen`}
                </span>
                <button
                  className="inline-flex h-8 shrink-0 items-center gap-2 rounded-lg bg-primary px-3 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90"
                  type="button"
                  onClick={() => {
                    setMinimised(false);
                    onWatch(broadcast.id);
                  }}
                >
                  <Tv aria-hidden="true" className="size-4" />
                  {watching === broadcast.id ? 'Open again' : 'Watch stream'}
                </button>
              </div>
            ))}
          </div>
        )}
        <ParticipantTiles
          avatars={avatars}
          participants={participants}
          watching={watching}
          layout="grid"
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
                onChange={(event) => onScreenVolume?.(active.id, Number(event.target.value))}
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

          <button
            className="live-action inline-flex items-center gap-2 rounded-lg border border-border bg-card/80 px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-accent"
            type="button"
            onClick={() => setMinimised(true)}
            aria-label="Back to the room"
          >
            <X size={15} />
            <span>Back to the room</span>
          </button>
        </div>
      </div>

      <div className="live-surface absolute inset-0 flex bg-stage" onDoubleClick={toggleFullScreen}>
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
          watching={watching}
          focusedId={active.id}
          layout="strip"
          onFocus={focus}
          onOptions={onOptions}
        />
        {children}
      </div>
    </section>
  );
}
