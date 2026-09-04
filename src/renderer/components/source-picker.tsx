import { useEffect, useState } from 'react';
import { LoaderCircle, Monitor, X } from 'lucide-react';
import type { CaptureSource } from '../../shared/desktop-api';

interface SourcePickerProps {
  open: boolean;
  onClose(): void;
  onSelect(sourceId?: string): void;
}

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
    window.desktop.capture.listScreens()
      .then((nextSources) => {
        setSources(nextSources);
        setSelectedId(nextSources[0]?.id);
      })
      .finally(() => setLoading(false));
  }, [open]);

  if (!open) return null;

  return (
    <div className="dialog-backdrop fixed inset-0 z-50 grid place-items-center bg-black/70 p-4 backdrop-blur-[2px]" role="presentation" onMouseDown={onClose}>
      <section className="dialog source-dialog flex max-h-[min(90vh,42rem)] w-[min(46rem,calc(100vw-2rem))] flex-col rounded-2xl border border-border bg-card text-card-foreground shadow-2xl" role="dialog" aria-modal="true" aria-labelledby="share-title" onMouseDown={(event) => event.stopPropagation()}>
        <header>
          <div>
            <h2 id="share-title">Share your full screen</h2>
            <p>System audio is included automatically on Windows.</p>
          </div>
          <button className="icon-button grid size-8 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground" type="button" onClick={onClose} aria-label="Close"><X size={19} /></button>
        </header>

        {loading ? (
          <div className="dialog-loading flex min-h-55 items-center justify-center gap-2 text-sm text-muted-foreground"><LoaderCircle className="spin animate-spin" size={24} /> Finding displays…</div>
        ) : sources.length > 0 ? (
          <div className="source-grid grid max-h-110 grid-cols-2 gap-3 overflow-y-auto px-5 py-4">
            {sources.map((source) => (
              <button
                key={source.id}
                className={`source-card${selectedId === source.id ? ' is-selected' : ''}`}
                type="button"
                onClick={() => setSelectedId(source.id)}
              >
                <img src={source.thumbnailDataUrl} alt="" />
                <span><Monitor size={16} /> {source.name}</span>
              </button>
            ))}
          </div>
        ) : (
          <div className="browser-share-message flex min-h-55 flex-col items-center justify-center gap-2 text-center text-sm text-muted-foreground">
            <Monitor size={26} />
            <strong>Use the system picker</strong>
            <span>Your browser will ask which display to share.</span>
          </div>
        )}

        <footer>
          <div className="audio-badge mr-auto flex items-center gap-2 text-[11px] text-success"><span /> System audio on</div>
          <button className="secondary-button inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-border bg-transparent px-3 text-xs font-medium text-foreground transition-colors hover:bg-accent disabled:pointer-events-none disabled:opacity-50" type="button" onClick={onClose}>Cancel</button>
          <button className="primary-button inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50" type="button" onClick={() => onSelect(selectedId)} disabled={loading}>
            Share full screen
          </button>
        </footer>
      </section>
    </div>
  );
}
