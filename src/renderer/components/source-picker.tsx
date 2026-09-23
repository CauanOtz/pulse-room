import { useEffect, useState } from 'react';
import { LoaderCircle, Monitor, Volume2 } from 'lucide-react';
import type { CaptureSource } from '../../shared/desktop-api';
import { Button } from './ui/button';
import {
  Dialog,
  DialogBody,
  DialogCloseButton,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';
import { cn } from './ui/utils';

interface SourcePickerProps {
  open: boolean;
  onClose(): void;
  onSelect(sourceId?: string): void;
}

/**
 * Which monitor to put into the room.
 *
 * Every screen is drawn at the same size whatever shape it is, and drawn whole
 * rather than filled, because the only question being asked here is which of
 * these is the one with the game on it.
 */
export function SourcePicker({ open, onClose, onSelect }: SourcePickerProps) {
  const [sources, setSources] = useState<CaptureSource[]>([]);
  const [selectedId, setSelectedId] = useState<string>();
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (!window.desktop) {
      setSources([]);
      return;
    }
    setLoading(true);
    window.desktop.capture
      .listScreens()
      .then((nextSources) => {
        setSources(nextSources);
        setSelectedId(nextSources[0]?.id);
      })
      .finally(() => setLoading(false));
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent
        className="source-dialog w-[min(46rem,calc(100vw-2rem))]"
        onOpenAutoFocus={(event) => event.preventDefault()}
      >
        <DialogHeader className="items-start">
          <div className="flex min-w-0 flex-col gap-1">
            <DialogTitle className="text-base font-semibold">Share your full screen</DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              System audio is included automatically on Windows.
            </DialogDescription>
          </div>
          <DialogCloseButton label="Close" />
        </DialogHeader>

        {loading ? (
          <DialogBody className="flex min-h-55 items-center justify-center gap-2 text-sm text-muted-foreground">
            <LoaderCircle className="spin size-6 animate-spin" aria-hidden="true" />
            Finding displays…
          </DialogBody>
        ) : sources.length > 0 ? (
          <DialogBody className="source-grid grid grid-cols-2 gap-3 space-y-0">
            {sources.map((source) => {
              const selected = selectedId === source.id;
              return (
                <button
                  key={source.id}
                  className={cn(
                    'source-card group/source flex flex-col gap-2 rounded-xl p-2 text-left transition-colors',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    selected ? 'is-selected bg-secondary' : 'hover:bg-accent',
                  )}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => setSelectedId(source.id)}
                  onDoubleClick={() => onSelect(source.id)}
                >
                  {/* One box, whatever shape the monitor is, and the whole
                      picture inside it rather than a crop of the middle. */}
                  <span
                    className={cn(
                      'grid aspect-video w-full place-items-center overflow-hidden rounded-lg bg-background',
                      selected
                        ? 'shadow-[inset_0_0_0_2px_var(--primary)]'
                        : 'shadow-[inset_0_0_0_1px_var(--border)]',
                    )}
                  >
                    <img className="size-full object-contain" src={source.thumbnailDataUrl} alt="" />
                  </span>
                  <span
                    className={cn(
                      'flex min-w-0 items-center gap-2 px-0.5 text-xs font-medium',
                      selected ? 'text-foreground' : 'text-muted-foreground',
                    )}
                  >
                    <Monitor aria-hidden="true" className="size-4 shrink-0" />
                    <span className="truncate">{source.name}</span>
                  </span>
                </button>
              );
            })}
          </DialogBody>
        ) : (
          <DialogBody className="browser-share-message flex min-h-55 flex-col items-center justify-center gap-2 space-y-0 text-center text-sm text-muted-foreground">
            <Monitor aria-hidden="true" className="size-7" />
            <strong className="text-foreground">Use the system picker</strong>
            <span>Your browser will ask which display to share.</span>
          </DialogBody>
        )}

        <footer className="flex items-center gap-2 border-t border-border px-5 py-4">
          <span className="audio-badge mr-auto flex items-center gap-2 text-[11px] font-medium text-muted-foreground">
            <Volume2 aria-hidden="true" className="size-3.5" />
            System audio on
          </span>
          <Button variant="ghost" type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" disabled={loading} onClick={() => onSelect(selectedId)}>
            Share full screen
          </Button>
        </footer>
      </DialogContent>
    </Dialog>
  );
}
