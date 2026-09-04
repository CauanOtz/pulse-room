import { useEffect, useRef } from 'react';
import { Check, MonitorOff } from 'lucide-react';
import type { ScreenSharePresetName } from '../domain/conference';

interface StreamMenuProps {
  sharing: boolean;
  quality: ScreenSharePresetName;
  onSelectQuality(preset: ScreenSharePresetName): void;
  onStop(): void;
  onClose(): void;
}

// Cheapest first, the way a person reads a quality list.
const ladder: { preset: ScreenSharePresetName; label: string }[] = [
  { preset: 'efficient', label: '720p · 30 fps' },
  { preset: 'balanced', label: '1080p · 30 fps' },
  { preset: 'motion', label: '1080p · 60 fps' },
];

/** The caret beside the share button: stop, or change how the screen is sent. */
export function StreamMenu({ sharing, quality, onSelectQuality, onStop, onClose }: StreamMenuProps) {
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
    <div className="popover-backdrop fixed inset-0 z-40" role="presentation" onMouseDown={onClose}>
      <div
        className="dock-menu absolute bottom-full right-0 mb-2 w-56 rounded-xl border border-border bg-popover p-1 text-popover-foreground shadow-xl"
        role="menu"
        aria-label="Stream options"
        ref={cardRef}
        tabIndex={-1}
        onMouseDown={(event) => event.stopPropagation()}
      >
        {sharing && (
          <button
            className="is-danger flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm text-destructive transition-colors hover:bg-destructive/10"
            type="button"
            role="menuitem"
            onClick={() => {
              onStop();
              onClose();
            }}
          >
            <MonitorOff size={15} /> Stop sharing
          </button>
        )}

        <p className="px-2.5 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Stream quality
        </p>
        {ladder.map((step) => (
          <button
            key={step.preset}
            className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm transition-colors hover:bg-accent"
            type="button"
            role="menuitemradio"
            aria-checked={step.preset === quality}
            onClick={() => {
              onSelectQuality(step.preset);
              onClose();
            }}
          >
            <span className="flex-1">{step.label}</span>
            {step.preset === quality && <Check size={14} className="shrink-0 text-primary" />}
          </button>
        ))}
      </div>
    </div>
  );
}
