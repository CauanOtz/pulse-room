import { useRef, useState } from 'react';
import { ImageUp, Trash2 } from 'lucide-react';
import { Avatar } from './avatar';
import { toSquareImage } from '../infrastructure/square-image';

interface PictureFieldProps {
  name: string;
  imageId?: string | null;
  label: string;
  canEdit: boolean;
  onChoose(image: Blob): Promise<void>;
  onRemove(): Promise<void>;
}

/** Picks a picture, squares it here, and hands the service only bytes. */
export function PictureField({ name, imageId, label, canEdit, onChoose, onRemove }: PictureFieldProps) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string>();

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setProblem(undefined);
    try {
      await action();
    } catch (error) {
      setProblem(error instanceof Error ? error.message : 'That picture could not be saved.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="picture-field flex items-center gap-3.5 rounded-xl border border-border bg-background/60 p-3.5">
      <Avatar name={name} imageId={imageId} className="picture-preview grid size-17 shrink-0 place-items-center rounded-2xl bg-secondary text-xl font-bold text-secondary-foreground" />
      <div className="picture-actions flex min-w-0 flex-col gap-2">
        <strong>{label}</strong>
        {canEdit ? (
          <>
            <div>
              <button type="button" className="secondary-button inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-border bg-transparent px-3 text-xs font-medium text-foreground transition-colors hover:bg-accent disabled:pointer-events-none disabled:opacity-50" disabled={busy} onClick={() => input.current?.click()}>
                <ImageUp size={15} /> {imageId ? 'Replace' : 'Add picture'}
              </button>
              {imageId && (
                <button type="button" className="secondary-button inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-border bg-transparent px-3 text-xs font-medium text-foreground transition-colors hover:bg-accent disabled:pointer-events-none disabled:opacity-50" disabled={busy} onClick={() => void run(onRemove)}>
                  <Trash2 size={15} /> Remove
                </button>
              )}
            </div>
            <small>{problem ?? 'PNG, JPEG or WebP. It is cropped to a square and shrunk before it is sent.'}</small>
          </>
        ) : (
          <small>Only the owner and administrators can change this.</small>
        )}
      </div>
      <input
        ref={input}
        className="picture-input pointer-events-none absolute size-px opacity-0"
        type="file"
        accept="image/png,image/jpeg,image/webp"
        aria-label={label}
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = '';
          if (file) void run(async () => onChoose(await toSquareImage(file)));
        }}
      />
    </div>
  );
}
