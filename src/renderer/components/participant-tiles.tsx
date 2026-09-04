import { MicOff, MonitorUp } from 'lucide-react';
import type { Participant } from '../domain/conference';
import { accountOf } from '../domain/roster';
import { Avatar } from './avatar';
import { MediaOutput } from './media-output';

interface ParticipantTilesProps {
  participants: Participant[];
  focusedId?: string;
  layout: 'grid' | 'strip';
  avatars?: ReadonlyMap<string, string | null | undefined>;
  onFocus(participant: Participant): void;
}

/**
 * Everybody in the channel, as tiles. A person shows their avatar; a person
 * sharing shows the picture itself, so the room is one glance.
 */
export function ParticipantTiles({ participants, focusedId, layout, avatars, onFocus }: ParticipantTilesProps) {
  return (
    <div className={layout === 'grid' ? 'tile-grid' : 'tile-strip'}>
      {participants.map((participant) => {
        const live = Boolean(participant.screenStream);
        return (
          <button
            className={[
              'participant-tile',
              participant.isSpeaking ? 'is-speaking' : '',
              participant.id === focusedId ? 'is-focused' : '',
            ].filter(Boolean).join(' ')}
            key={participant.id}
            type="button"
            aria-label={live ? `Watch ${participant.name}` : participant.name}
            aria-pressed={participant.id === focusedId}
            disabled={!live}
            onClick={() => onFocus(participant)}
          >
            {live ? (
              <MediaOutput
                stream={participant.screenStream}
                muted
                video
                className="tile-video"
                label={`${participant.name} screen preview`}
              />
            ) : (
              <Avatar
                className="tile-avatar"
                name={participant.name}
                initials={participant.initials}
                imageId={avatars?.get(accountOf(participant.id))}
                accent={participant.accent}
              />
            )}

            {live && <span className="tile-live">Live</span>}

            <span className="tile-name">
              {participant.isMuted && <MicOff size={12} />}
              {live && !participant.isMuted && <MonitorUp size={12} />}
              {participant.isLocal ? `${participant.name} (you)` : participant.name}
            </span>
          </button>
        );
      })}
    </div>
  );
}
