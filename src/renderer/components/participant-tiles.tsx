import { MicOff, MonitorUp } from 'lucide-react';
import type { Participant } from '../domain/conference';
import { accountOf } from '../domain/roster';
import { Avatar } from './avatar';
import { MediaOutput } from './media-output';
import { cn } from './ui/utils';

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
    <div
      className={
        layout === 'grid'
          ? 'tile-grid grid min-h-0 flex-1 content-center justify-center gap-2 overflow-y-auto p-3 [grid-template-columns:repeat(auto-fit,minmax(220px,1fr))]'
          : 'tile-strip flex flex-wrap justify-center gap-2'
      }
    >
      {participants.map((participant) => {
        const live = Boolean(participant.screenStream);
        return (
          <button
            className={cn(
              'participant-tile relative grid aspect-video place-items-center overflow-hidden rounded-xl bg-card',
              layout === 'grid' ? 'w-full max-w-105 justify-self-center' : 'w-37',
              'enabled:cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              participant.isSpeaking && 'is-speaking shadow-[inset_0_0_0_2px_var(--success)]',
              participant.id === focusedId && 'is-focused shadow-[inset_0_0_0_2px_var(--primary)]',
            )}
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
                className="tile-video size-full object-cover"
                label={`${participant.name} screen preview`}
              />
            ) : (
              <Avatar
                className="tile-avatar grid aspect-square w-[30%] max-w-20 place-items-center rounded-full text-sm font-extrabold text-background"
                name={participant.name}
                initials={participant.initials}
                imageId={avatars?.get(accountOf(participant.id))}
                accent={participant.accent}
              />
            )}

            {live && <span className="tile-live absolute right-2 top-2 rounded-md bg-destructive px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-destructive-foreground">Live</span>}

            <span className="tile-name absolute inset-x-2 bottom-2 flex items-center gap-1.5 truncate rounded-md bg-black/55 px-2 py-1 text-[11px] font-medium text-white">
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
