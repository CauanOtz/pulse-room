import { memo } from 'react';
import { Eye, MicOff, MonitorUp, Tv } from 'lucide-react';
import type { Participant } from '../domain/conference';
import { accountOf } from '../domain/roster';
import { Avatar } from './avatar';
import { MediaOutput } from './media-output';
import { SignalBars } from './signal-bars';
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
 *
 * A tile is meant to answer every question about somebody without being asked:
 * whether they are talking, whether their microphone is off, whether their line
 * is struggling, whether they have a screen running and whether this machine
 * took it. All of that is drawn at once, quietly, and none of it moves.
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
      {participants.map((participant) => (
        <ParticipantTile
          key={participant.id}
          participant={participant}
          // Each tile is given plain values, so somebody else starting to talk
          // cannot make this one redraw.
          wanted={participant.isLocal || Boolean(watching?.includes(participant.id))}
          focused={participant.id === focusedId}
          layout={layout}
          avatarId={avatars?.get(accountOf(participant.id))}
          onFocus={onFocus}
          onOptions={onOptions}
        />
      ))}
    </div>
  );
}

interface ParticipantTileProps {
  participant: Participant;
  wanted: boolean;
  focused: boolean;
  layout: 'grid' | 'strip';
  avatarId?: string | null;
  onFocus(participant: Participant): void;
  onOptions?(participant: Participant, position: { x: number; y: number }): void;
}

/**
 * One person.
 *
 * Memoised on purpose: a room of four produces a rebuild several times a
 * second, and only one of those tiles has usually changed. Everything it reads
 * is a value or a stable callback, so the comparison is honest.
 */
const ParticipantTile = memo(function ParticipantTile({
  participant,
  wanted,
  focused,
  layout,
  avatarId,
  onFocus,
  onOptions,
}: ParticipantTileProps) {
  // A picture is drawn only for the screen this client asked to watch. Anyone
  // else shows the person, whether or not their video happens to be passing
  // through for a glance somewhere else. Your own capture is already on this
  // machine, so your tile shows it without asking: it is how you check you
  // picked the right monitor.
  const picture =
    wanted && participant.screenStream?.getVideoTracks().length ? participant.screenStream : undefined;
  // Whether they are live is theirs to say; whether a picture is drawn depends
  // on whether this client asked for one.
  const live = participant.isBroadcasting;
  const taken = Boolean(picture) && !participant.isLocal;
  const small = layout === 'strip';

  return (
    <button
      className={cn(
        'participant-tile group/tile relative grid aspect-video place-items-center overflow-hidden rounded-xl bg-card',
        'shadow-[var(--gloss)]',
        layout === 'grid' ? 'w-full max-w-105 justify-self-center' : 'w-37',
        'enabled:cursor-pointer enabled:hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        // An outline is drawn by the compositor and costs nothing to turn on
        // and off; a box shadow that animates repaints the tile underneath it,
        // and in this room that would happen every time anybody speaks.
        (participant.isSpeaking || focused) && 'is-speaking outline outline-1 -outline-offset-1 outline-foreground',
        focused && 'is-focused',
      )}
      type="button"
      aria-label={live ? `Watch ${participant.name}` : participant.name}
      aria-pressed={focused}
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
        // The ring is the loudest thing a quiet tile does, so it is the one
        // thing that says who is talking from across the room.
        <span
          className={cn(
            'tile-face grid aspect-square w-[30%] max-w-20 place-items-center rounded-full',
            participant.isSpeaking && 'outline outline-2 outline-offset-2 outline-foreground',
          )}
        >
          <Avatar
            className="tile-avatar grid size-full place-items-center rounded-full text-sm font-extrabold text-background"
            name={participant.name}
            initials={participant.initials}
            imageId={avatarId}
            accent={participant.accent}
          />
        </span>
      )}

      {/* What is true about this tile, said in the corner and left there. */}
      {live && !small && (
        <span className="tile-flags absolute left-2.5 top-2.5 flex items-center gap-1.5">
          <span
            className={cn(
              'tile-live inline-flex items-center gap-1.5 rounded-md px-1.5 py-0.5 text-[9.5px] font-bold uppercase tracking-[0.12em]',
              picture
                ? 'bg-black/55 text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.18)]'
                : 'bg-destructive text-destructive-foreground',
            )}
          >
            <span className={cn('size-1 rounded-full', picture ? 'bg-destructive' : 'bg-current')} />
            Live
          </span>
          {taken && (
            <span className="tile-taken inline-flex items-center gap-1 rounded-md bg-black/55 px-1.5 py-0.5 text-[9.5px] font-bold uppercase tracking-[0.12em] text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.18)]">
              <Eye aria-hidden="true" className="size-2.5" />
              Watching
            </span>
          )}
        </span>
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
        {/* A tile this small has no room for a word, so it keeps the dot. */}
        {live && small && <span className="tile-live size-1.5 shrink-0 rounded-full bg-destructive" aria-label="Live" />}
        {participant.isMuted && <MicOff aria-label="Muted" size={12} className="shrink-0 text-destructive" />}
        {picture && !participant.isMuted && <MonitorUp aria-hidden="true" size={12} className="shrink-0" />}
        <span className="min-w-0 truncate">
          {participant.isLocal ? `${participant.name} (you)` : participant.name}
        </span>
        <SignalBars className="ml-auto text-white" signal={participant.signal} />
      </span>
    </button>
  );
});
