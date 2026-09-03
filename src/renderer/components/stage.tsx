import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Headphones, Maximize2, Minimize2, MonitorUp, Radio, ShieldCheck, Volume2 } from 'lucide-react';
import type { Participant } from '../domain/conference';
import { MediaOutput } from './media-output';

interface StageProps {
  participants: Participant[];
  joined: boolean;
  speakerDeviceId?: string;
  expandLevels?: boolean;
  /** The call controls, which ride along with the fading overlay. */
  children?: ReactNode;
}

export function Stage({ participants, joined, speakerDeviceId, expandLevels, children }: StageProps) {
  const broadcasts = participants.filter((participant) => participant.screenStream);
  const [preferredId, setPreferredId] = useState<string>();
  // Showing your own monitor on the monitor being captured feeds the capture
  // back into itself, so a friend's screen is the better default view.
  const fallback = broadcasts.find((broadcast) => !broadcast.isLocal) ?? broadcasts[0];
  const active = broadcasts.find((broadcast) => broadcast.id === preferredId) ?? fallback;
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

  if (active?.screenStream) {
    return (
      <section
        className={`stage stage-live${controlsVisible ? '' : ' is-idle'}`}
        ref={stageRef}
        onMouseMove={revealControls}
        onMouseLeave={() => setControlsVisible(false)}
        onFocusCapture={holdControls}
      >
        <div
          className={`live-toolbar${controlsVisible ? '' : ' is-hidden'}`}
          onMouseEnter={holdControls}
          onMouseMove={holdControls}
        >
          <div className="live-source">
            <span className="live-pulse" /> Live from {active.isLocal ? 'your screen' : active.name}
          </div>

          <div className="live-tools">
            {!active.isLocal && (
              <label className="live-volume">
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
              className="live-action"
              type="button"
              onClick={toggleFullScreen}
              aria-label={fullScreen ? 'Exit full screen' : 'Enter full screen'}
            >
              {fullScreen ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
              <span>{fullScreen ? 'Exit' : 'Full screen'}</span>
            </button>
          </div>
        </div>

        <div className="live-surface" onDoubleClick={toggleFullScreen}>
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

        <div className={`live-overlay${controlsVisible ? '' : ' is-hidden'}`}>
          {broadcasts.length > 1 && (
            <div className="live-tiles" role="tablist" aria-label="Live screens">
              {broadcasts.map((broadcast) => (
                <button
                  className={`live-tile${broadcast.id === active.id ? ' is-active' : ''}`}
                  key={broadcast.id}
                  type="button"
                  role="tab"
                  aria-selected={broadcast.id === active.id}
                  aria-label={broadcast.isLocal ? 'Your screen' : broadcast.name}
                  onClick={() => setPreferredId(broadcast.id)}
                >
                  <MediaOutput
                    stream={broadcast.screenStream}
                    muted
                    video
                    className="tile-video"
                    label={`${broadcast.isLocal ? 'Your' : broadcast.name} screen preview`}
                  />
                  <span>{broadcast.isLocal ? 'Your screen' : broadcast.name}</span>
                </button>
              ))}
            </div>
          )}
          {children}
        </div>
      </section>
    );
  }

  return (
    <section className="stage stage-empty" ref={stageRef}>
      <div className="ambient-ring ring-one" />
      <div className="ambient-ring ring-two" />
      <div className="stage-symbol"><Radio size={31} /></div>
      <h1>{joined ? 'The room is yours' : 'Come as you are'}</h1>
      <p>
        {joined
          ? 'Share your entire monitor with game sound, music, and desktop audio in one stream.'
          : 'A quiet place for loud nights. Pick a voice channel on the left to join.'}
      </p>
      <div className="stage-facts">
        <span><ShieldCheck size={16} /> Noise suppression</span>
        <span><Headphones size={16} /> Separate volumes</span>
        <span><MonitorUp size={16} /> 1080p screen audio</span>
      </div>
      <div className="live-overlay">{children}</div>
    </section>
  );
}
