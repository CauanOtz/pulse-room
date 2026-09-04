import { useEffect, useRef } from 'react';
import { VolumeX, Volume2 } from 'lucide-react';
import type { RosterEntry } from '../domain/roster';

interface ParticipantPopoverProps {
  entry: RosterEntry;
  position: { x: number; y: number };
  onVolumeChange(volume: number): void;
  onMutedChange(muted: boolean): void;
  onClose(): void;
}

export function ParticipantPopover({ entry, position, onVolumeChange, onMutedChange, onClose }: ParticipantPopoverProps) {
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
        className="participant-popover fixed z-50 w-58 rounded-xl border border-border bg-popover p-3 text-popover-foreground shadow-2xl"
        role="dialog"
        aria-label={`${entry.name} audio`}
        ref={cardRef}
        tabIndex={-1}
        style={{ left: position.x, top: position.y }}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header>
          <span className="popover-avatar grid size-8 shrink-0 place-items-center rounded-xl text-[11px] font-bold text-background" style={{ background: entry.accent }}>{entry.initials}</span>
          <strong>{entry.name}</strong>
        </header>

        <label className="popover-volume flex flex-col gap-2 text-xs text-muted-foreground">
          <span>Volume<em>{entry.volume}%</em></span>
          <input
            aria-label={`${entry.name} volume`}
            type="range"
            min="0"
            max="200"
            value={entry.volume}
            onChange={(event) => onVolumeChange(Number(event.target.value))}
          />
        </label>

        <button type="button" className={entry.locallyMuted ? 'popover-action is-active' : 'popover-action'} onClick={() => onMutedChange(!entry.locallyMuted)}>
          {entry.locallyMuted ? <VolumeX size={15} /> : <Volume2 size={15} />}
          {entry.locallyMuted ? 'Unmute for me' : 'Mute for me'}
        </button>
      </div>
    </div>
  );
}
