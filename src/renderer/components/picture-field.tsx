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
    <div className="picture-field">
      <Avatar name={name} imageId={imageId} className="picture-preview" />
      <div className="picture-actions">
        <strong>{label}</strong>
        {canEdit ? (
          <>
            <div>
              <button type="button" className="secondary-button" disabled={busy} onClick={() => input.current?.click()}>
                <ImageUp size={15} /> {imageId ? 'Replace' : 'Add picture'}
              </button>
              {imageId && (
                <button type="button" className="secondary-button" disabled={busy} onClick={() => void run(onRemove)}>
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
        className="picture-input"
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
