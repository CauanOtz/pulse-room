import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Check, LoaderCircle, Monitor, Volume2 } from 'lucide-react';
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
        className="source-dialog w-[min(52rem,calc(100vw-2rem))]"
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
          <DialogBody
            className="source-grid grid grid-cols-2 gap-3 space-y-0"
            onKeyDown={(event) => {
              const index = sources.findIndex((source) => source.id === selectedId);
              if (event.key === 'Enter') onSelect(selectedId);
              const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
              if (!step) return;
              event.preventDefault();
              setSelectedId(sources[(index + step + sources.length) % sources.length]?.id);
            }}
          >
            {sources.map((source, index) => {
              const selected = selectedId === source.id;
              return (
                <motion.button
                  key={source.id}
                  className={cn('source-card', selected && 'is-selected')}
                  type="button"
                  aria-pressed={selected}
                  initial={{ opacity: 0, y: 12, scale: 0.97 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{ delay: 0.05 * index, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                  onClick={() => setSelectedId(source.id)}
                  onDoubleClick={() => onSelect(source.id)}
                >
                  {/* One box, whatever shape the monitor is, and the whole
                      picture inside it rather than a crop of the middle. */}
                  <span className="source-frame">
                    <img src={source.thumbnailDataUrl} alt="" />
                    {selected && (
                      <motion.span
                        layoutId="source-selection"
                        className="source-ring"
                        transition={{ type: 'spring', stiffness: 480, damping: 38 }}
                      />
                    )}
                    <span className="source-index font-mono">{String(index + 1).padStart(2, '0')}</span>
                    <AnimatePresence>
                      {selected && (
                        <motion.span
                          className="source-check"
                          initial={{ scale: 0.3, opacity: 0, rotate: -40 }}
                          animate={{ scale: 1, opacity: 1, rotate: 0 }}
                          exit={{ scale: 0.3, opacity: 0 }}
                          transition={{ type: 'spring', stiffness: 520, damping: 26 }}
                        >
                          <Check size={13} strokeWidth={3} />
                        </motion.span>
                      )}
                    </AnimatePresence>
                  </span>
                  <span className="source-name">
                    <Monitor aria-hidden="true" className="size-3.5 shrink-0" />
                    <span className="truncate">{source.name}</span>
                  </span>
                </motion.button>
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

        <footer className="source-footer flex items-center gap-2 border-t border-border px-5 py-4">
          <span className="audio-badge mr-auto">
            <span className="audio-bars" aria-hidden="true">
              <i />
              <i />
              <i />
            </span>
            <Volume2 aria-hidden="true" className="size-3.5" />
            System audio on
          </span>
          <span className="source-hint" aria-hidden="true">
            <kbd>←</kbd>
            <kbd>→</kbd> choose <kbd>Enter</kbd> share
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
