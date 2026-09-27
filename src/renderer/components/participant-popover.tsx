import { useEffect, useRef, type ReactNode } from 'react';
import { MonitorOff, UserRound, VolumeX, Volume2 } from 'lucide-react';
import type { RosterEntry } from '../domain/roster';

interface ParticipantPopoverProps {
  entry: RosterEntry;
  position: { x: number; y: number };
  /** True while their screen is the one this client asked for. */
  watching?: boolean;
  onVolumeChange(volume: number): void;
  onMutedChange(muted: boolean): void;
  onStopWatching?(): void;
  /** Opens their whole profile. */
  onOpenProfile?(): void;
  /** What can be done to them in this server, for somebody allowed to. */
  moderation?: ReactNode;
  onClose(): void;
}

export function ParticipantPopover({
  entry,
  position,
  watching,
  onVolumeChange,
  onMutedChange,
  onStopWatching,
  onOpenProfile,
  moderation,
  onClose,
}: ParticipantPopoverProps) {
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  useEffect(() => cardRef.current?.focus(), []);

  return (
    <div className="popover-backdrop fixed inset-0 z-40" role="presentation" onMouseDown={onClose} onContextMenu={(event) => event.preventDefault()}>
      <div
        className="participant-popover fixed z-50 max-h-[calc(100vh-1.5rem)] w-62 overflow-y-auto rounded-lg border border-border bg-popover p-3 text-popover-foreground shadow-2xl"
        role="dialog"
        aria-label={`${entry.name} audio`}
        ref={cardRef}
        tabIndex={-1}
        // Kept inside the window: a menu opened near the bottom of the room
        // grows upward rather than running off it.
        style={{
          left: Math.min(position.x, window.innerWidth - 260),
          top: Math.max(12, Math.min(position.y, window.innerHeight - (moderation ? 420 : 200))),
        }}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="mb-3 flex items-center gap-2.5">
          <span className="popover-avatar grid size-8 shrink-0 place-items-center rounded-[10px] text-[11px] font-bold text-background" style={{ background: entry.accent }}>{entry.initials}</span>
          <strong className="min-w-0 truncate text-sm font-semibold">{entry.name}</strong>
        </header>

        <label className="popover-volume flex flex-col gap-2 text-xs text-muted-foreground">
          <span className="flex items-center justify-between"><span>Volume</span><em className="font-mono text-[11px] not-italic text-foreground">{entry.volume}%</em></span>
          <input
            aria-label={`${entry.name} volume`}
            type="range"
            min="0"
            max="200"
            value={entry.volume}
            onChange={(event) => onVolumeChange(Number(event.target.value))}
          />
        </label>

        <button type="button" className={`popover-action mt-2 flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-xs font-medium transition-colors hover:bg-accent ${entry.locallyMuted ? 'is-active text-destructive' : 'text-foreground'}`} onClick={() => onMutedChange(!entry.locallyMuted)}>
          {entry.locallyMuted ? <VolumeX size={15} /> : <Volume2 size={15} />}
          {entry.locallyMuted ? 'Unmute for me' : 'Mute for me'}
        </button>

        {onOpenProfile && (
          <button
            type="button"
            className="popover-action flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-xs font-medium text-foreground transition-colors hover:bg-accent"
            onClick={() => {
              onOpenProfile();
              onClose();
            }}
          >
            <UserRound size={15} />
            Profile
          </button>
        )}

        {watching && (
          // Putting a screen away is not the same as refusing it, so the one
          // act that hangs up on somebody's stream is asked for by name.
          <button
            type="button"
            className="popover-action flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-xs font-medium text-foreground transition-colors hover:bg-accent"
            onClick={() => {
              onStopWatching?.();
              onClose();
            }}
          >
            <MonitorOff size={15} />
            Stop watching
          </button>
        )}

        {moderation && <div className="mt-2 border-t border-border pt-2">{moderation}</div>}
      </div>
    </div>
  );
}
