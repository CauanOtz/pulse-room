import { useCallback, useEffect, useRef, useState } from 'react';
import { Headphones, Maximize2, Minimize2, MonitorUp, Radio, ShieldCheck } from 'lucide-react';
import type { Participant } from '../domain/conference';
import { MediaOutput } from './media-output';

interface StageProps {
  participants: Participant[];
  joined: boolean;
  speakerDeviceId?: string;
}

export function Stage({ participants, joined, speakerDeviceId }: StageProps) {
  const broadcasts = participants.filter((participant) => participant.screenStream);
  const [preferredId, setPreferredId] = useState<string>();
  // Showing your own monitor on the monitor being captured feeds the capture
  // back into itself, so a friend's screen is the better default view.
  const fallback = broadcasts.find((broadcast) => !broadcast.isLocal) ?? broadcasts[0];
  const active = broadcasts.find((broadcast) => broadcast.id === preferredId) ?? fallback;
  const stageRef = useRef<HTMLElement>(null);
  const [fullScreen, setFullScreen] = useState(false);

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
      <section className="stage stage-live" ref={stageRef}>
        <div className="live-toolbar">
          <div className="live-source">
            <span className="live-pulse" /> Live from {active.isLocal ? 'your screen' : active.name}
          </div>

          {broadcasts.length > 1 && (
            <div className="live-switcher" role="tablist" aria-label="Live screens">
              {broadcasts.map((broadcast) => (
                <button
                  key={broadcast.id}
                  type="button"
                  role="tab"
                  aria-selected={broadcast.id === active.id}
                  className={broadcast.id === active.id ? 'is-active' : ''}
                  onClick={() => setPreferredId(broadcast.id)}
                >
                  {broadcast.isLocal ? 'Your screen' : broadcast.name}
                </button>
              ))}
            </div>
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

        <div className="live-surface" onDoubleClick={toggleFullScreen}>
          <MediaOutput
            key={active.id}
            stream={active.screenStream}
            muted={active.isLocal}
            speakerDeviceId={speakerDeviceId}
            video
            className="screen-video"
            volume={active.volume}
          />
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
          : 'A quiet place for loud nights. Join voice when you are ready.'}
      </p>
      <div className="stage-facts">
        <span><ShieldCheck size={16} /> Noise suppression</span>
        <span><Headphones size={16} /> Separate volumes</span>
        <span><MonitorUp size={16} /> 1080p screen audio</span>
      </div>
    </section>
  );
}
