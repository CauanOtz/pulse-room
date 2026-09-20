import { MicOff, MonitorUp, Tv } from 'lucide-react';
import type { Participant } from '../domain/conference';
import { accountOf } from '../domain/roster';
import { Avatar } from './avatar';
import { MediaOutput } from './media-output';
import { cn } from './ui/utils';

interface ParticipantTilesProps {
  participants: Participant[];
  /** Whose pictures this client asked for. Nobody else's tile draws one. */
  watching?: string[];
  focusedId?: string;
  layout: 'grid' | 'strip';
  avatars?: ReadonlyMap<string, string | null | undefined>;
  onFocus(participant: Participant): void;
  /** A right click asks what else can be done with the person under it. */
  onOptions?(participant: Participant, position: { x: number; y: number }): void;
}

/**
 * Everybody in the channel, as tiles. A person shows their avatar; a person
 * sharing shows the picture itself, so the room is one glance.
 */
export function ParticipantTiles({
  participants,
  watching,
  focusedId,
  layout,
  avatars,
  onFocus,
  onOptions,
}: ParticipantTilesProps) {
  return (
    <div
      className={
        layout === 'grid'
          ? 'tile-grid grid min-h-0 flex-1 content-center justify-center gap-2 overflow-y-auto p-3 [grid-template-columns:repeat(auto-fit,minmax(220px,1fr))]'
          : 'tile-strip flex flex-wrap justify-center gap-2'
      }
    >
      {participants.map((participant) => {
        // A picture is drawn only for the screen this client asked to watch.
        // Anyone else shows the person, whether or not their video happens to
        // be passing through for a glance somewhere else.
        // Your own capture is already on this machine, so your tile shows it
        // without asking: it is how you check you picked the right monitor.
        const wanted = participant.isLocal || watching?.includes(participant.id);
        const picture =
          wanted && participant.screenStream?.getVideoTracks().length
            ? participant.screenStream
            : undefined;
        // Whether they are live is theirs to say; whether a picture is drawn
        // depends on whether this client asked for one.
        const live = participant.isBroadcasting;
        return (
          <button
            className={cn(
              'participant-tile group/tile relative grid aspect-video place-items-center overflow-hidden rounded-xl bg-card',
              'shadow-[var(--gloss)] transition-colors duration-150',
              layout === 'grid' ? 'w-full max-w-105 justify-self-center' : 'w-37',
              'enabled:cursor-pointer enabled:hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              participant.isSpeaking && 'is-speaking shadow-[var(--gloss),inset_0_0_0_1px_var(--foreground)]',
              participant.id === focusedId && 'is-focused shadow-[var(--gloss),inset_0_0_0_1px_var(--foreground)]',
            )}
            key={participant.id}
            type="button"
            aria-label={live ? `Watch ${participant.name}` : participant.name}
            aria-pressed={participant.id === focusedId}
            disabled={!live}
            onClick={() => onFocus(participant)}
            onContextMenu={(event) => {
              if (!onOptions || participant.isLocal) return;
              event.preventDefault();
              onOptions(participant, { x: event.clientX, y: event.clientY });
            }}
          >
            {picture ? (
              <MediaOutput
                stream={picture}
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

            {live && !participant.isLocal && (
              // Nothing appears or moves: the label is always laid out, and the
              // pointer only brings it up from nothing.
              <span
                className={cn(
                  'tile-action pointer-events-none absolute inset-0 grid place-items-center opacity-0',
                  'transition-opacity duration-150 group-hover/tile:opacity-100 group-focus-within/tile:opacity-100',
                )}
              >
                <span
                  className={cn(
                    'inline-flex items-center gap-2 rounded-lg px-3.5 py-2.5 text-xs font-semibold shadow-lg',
                    picture
                      ? 'bg-black/55 text-foreground shadow-[inset_0_0_0_1px_rgba(255,255,255,0.22)]'
                      : 'bg-foreground text-background',
                  )}
                >
                  <Tv className="size-3.5" aria-hidden="true" />
                  {picture ? 'Stop watching' : `Watch ${participant.name}`}
                </span>
              </span>
            )}

            <span className="tile-name absolute inset-x-0 bottom-0 flex items-center gap-2 truncate bg-gradient-to-t from-black/75 to-transparent px-3 py-2.5 text-[11.5px] font-medium text-white">
              {live && <span className="tile-live size-1.5 shrink-0 rounded-full bg-destructive" aria-label="Live" />}
              {participant.isMuted && <MicOff size={12} />}
              {picture && !participant.isMuted && <MonitorUp size={12} />}
              {participant.isLocal ? `${participant.name} (you)` : participant.name}
            </span>
          </button>
        );
      })}
    </div>
  );
}
