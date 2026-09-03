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
    <div className="dialog-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="dialog source-dialog" role="dialog" aria-modal="true" aria-labelledby="share-title" onMouseDown={(event) => event.stopPropagation()}>
        <header>
          <div>
            <h2 id="share-title">Share your full screen</h2>
            <p>System audio is included automatically on Windows.</p>
          </div>
          <button className="icon-button" type="button" onClick={onClose} aria-label="Close"><X size={19} /></button>
        </header>

        {loading ? (
          <div className="dialog-loading"><LoaderCircle className="spin" size={24} /> Finding displays…</div>
        ) : sources.length > 0 ? (
          <div className="source-grid">
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
          <div className="browser-share-message">
            <Monitor size={26} />
            <strong>Use the system picker</strong>
            <span>Your browser will ask which display to share.</span>
          </div>
        )}

        <footer>
          <div className="audio-badge"><span /> System audio on</div>
          <button className="secondary-button" type="button" onClick={onClose}>Cancel</button>
          <button className="primary-button" type="button" onClick={() => onSelect(selectedId)} disabled={loading}>
            Share full screen
          </button>
        </footer>
      </section>
    </div>
  );
}
