import { MicOff, MonitorUp, Volume1, Volume2 } from 'lucide-react';
import type { Participant } from '../domain/conference';
import { MediaOutput } from './media-output';

interface ParticipantListProps {
  participants: Participant[];
  speakerDeviceId?: string;
  onVolumeChange(participantId: string, volume: number): void;
}

export function ParticipantList({ participants, speakerDeviceId, onVolumeChange }: ParticipantListProps) {
  return (
    <aside className="participant-panel">
      <header>
        <div>
          <span className="presence-dot" />
          <strong>In the room</strong>
        </div>
        <span>{participants.length}</span>
      </header>

      <div className="participant-stack">
        {participants.map((participant) => (
          <article className={`participant-item${participant.isSpeaking ? ' is-speaking' : ''}`} key={participant.id}>
            <div className="avatar-shell" style={{ '--avatar-accent': participant.accent } as React.CSSProperties}>
              <span>{participant.initials}</span>
              {participant.isSpeaking && <i />}
            </div>
            <div className="participant-copy">
              <div>
                <strong>{participant.name}</strong>
                {participant.isLocal && <em>You</em>}
              </div>
              <span>{participant.isSpeaking ? 'Speaking' : participant.isMuted ? 'Muted' : 'Listening'}</span>
            </div>
            {participant.screenStream && <MonitorUp size={16} className="screen-indicator" />}
            {participant.isMuted && <MicOff size={16} className="muted-indicator" />}
            {!participant.isLocal && (
              <label className="volume-control">
                {participant.volume === 0 ? <Volume1 size={16} /> : <Volume2 size={16} />}
                <input
                  aria-label={`${participant.name} volume`}
                  type="range"
                  min="0"
                  max="100"
                  value={participant.volume}
                  onChange={(event) => onVolumeChange(participant.id, Number(event.target.value))}
                />
              </label>
            )}
            <MediaOutput
              stream={participant.microphoneStream}
              muted={participant.isLocal}
              speakerDeviceId={speakerDeviceId}
              volume={participant.volume}
            />
          </article>
        ))}
      </div>

      <div className="room-note">
        <strong>Full-screen audio</strong>
        <p>Game and desktop sound stay stereo and separate from voice processing.</p>
      </div>
    </aside>
  );
}
