import { Headphones, MonitorUp, Radio, ShieldCheck } from 'lucide-react';
import type { Participant } from '../domain/conference';
import { MediaOutput } from './media-output';

interface StageProps {
  participants: Participant[];
  joined: boolean;
  speakerDeviceId?: string;
}

export function Stage({ participants, joined, speakerDeviceId }: StageProps) {
  const sharingParticipant = participants.find((participant) => participant.screenStream);

  if (sharingParticipant?.screenStream) {
    return (
      <section className="stage stage-live">
        <div className="live-toolbar">
          <div><span className="live-pulse" /> Live from {sharingParticipant.name}</div>
          <span>Full screen · System audio</span>
        </div>
        <MediaOutput
          stream={sharingParticipant.screenStream}
          muted={sharingParticipant.isLocal}
          speakerDeviceId={speakerDeviceId}
          video
          className="screen-video"
          volume={sharingParticipant.volume}
        />
      </section>
    );
  }

  return (
    <section className="stage stage-empty">
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
