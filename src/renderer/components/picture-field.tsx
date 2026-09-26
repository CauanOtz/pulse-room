import { useRef, useState } from 'react';
import { ImageUp, Trash2 } from 'lucide-react';
import { Avatar } from './avatar';
import { acceptedTypes, maxSourceBytes, type PictureKind } from '../infrastructure/prepare-image';
import { cn } from './ui/utils';
import { ImageCropDialog } from './image-crop-dialog';

interface PictureFieldProps {
  name: string;
  imageId?: string | null;
  label: string;
  canEdit: boolean;
  variant?: 'card' | 'identity';
  username?: string;
  statusLabel?: string;
  /** What the picture is for, which decides the shape it is cropped to. */
  kind?: PictureKind;
  onChoose(image: Blob): Promise<void>;
  onRemove(): Promise<void>;
}

/** Picks a picture, squares it here, and hands the service only bytes. */
export function PictureField({
  name,
  imageId,
  label,
  canEdit,
  variant = 'card',
  username,
  statusLabel,
  kind = 'avatar',
  onChoose,
  onRemove,
}: PictureFieldProps) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string>();
  const [editingFile, setEditingFile] = useState<File>();

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
    <div
      className={cn(
        'picture-field min-w-0',
        variant === 'identity'
          ? 'grid grid-cols-[4rem_minmax(0,1fr)] items-start gap-x-4 py-1'
          : 'flex items-center gap-3.5 rounded-xl border border-border bg-background/60 p-3.5',
      )}
    >
      <Avatar
        name={name}
        imageId={imageId}
        className={cn(
          'picture-preview grid shrink-0 place-items-center bg-secondary font-bold text-secondary-foreground',
          variant === 'identity'
            ? 'size-16 rounded-[1.1rem] text-lg'
            : 'size-17 rounded-2xl text-xl',
        )}
      />
      <div className={cn('picture-actions flex min-w-0 flex-col gap-2', variant === 'identity' && 'pt-0.5')}>
        {variant === 'identity' ? (
          <div className="flex min-w-0 flex-wrap items-center justify-between gap-x-3 gap-y-1">
            <strong className="flex min-w-0 items-baseline gap-1.5 text-sm font-semibold text-foreground">
              <span className="truncate">{name}</span>
              {username && <span className="truncate text-xs font-normal text-muted-foreground">· @{username}</span>}
            </strong>
            {statusLabel && (
              <span className="inline-flex shrink-0 items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
                <span className="size-1.5 rounded-full bg-success" aria-hidden="true" />
                {statusLabel}
              </span>
            )}
          </div>
        ) : (
          <strong>{label}</strong>
        )}
        {canEdit ? (
          <>
            <div className={cn('flex flex-wrap items-center gap-2', variant === 'identity' && 'mt-1')}>
              <button type="button" className="secondary-button inline-flex h-8 items-center justify-center gap-2 rounded-md border border-border bg-transparent px-3 text-xs font-medium text-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50" disabled={busy} onClick={() => input.current?.click()}>
                <ImageUp size={15} /> {imageId ? 'Replace' : 'Add picture'}
              </button>
              {imageId && (
                <button type="button" className="secondary-button inline-flex h-8 items-center justify-center gap-2 rounded-md border border-border bg-transparent px-3 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50" disabled={busy} onClick={() => void run(onRemove)}>
                  <Trash2 size={15} /> Remove
                </button>
              )}
            </div>
            {problem ? (
              // A refused picture is the one thing here worth reading, so it is
              // not left in the same grey as the hint it replaces.
              <small className="picture-problem rounded-md bg-destructive/10 px-2 py-1 text-xs font-medium text-destructive" role="alert">
                {problem}
              </small>
            ) : (
              <small className={cn('max-w-[30rem] text-[11px] font-normal text-muted-foreground', variant === 'identity' && 'leading-relaxed')}>
                PNG, JPEG, WebP or GIF · Max 15 MB. A GIF keeps moving.
              </small>
            )}
          </>
        ) : (
          <small>Only the owner and administrators can change this.</small>
        )}
      </div>
      <input
        ref={input}
        className="picture-input pointer-events-none absolute size-px opacity-0"
        type="file"
        accept={acceptedTypes.join(',')}
        aria-label={label}
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = '';
          if (!file) return;
          if (!acceptedTypes.includes(file.type)) {
            setProblem('Choose a PNG, JPEG, WebP or GIF picture.');
            return;
          }
          if (file.size > maxSourceBytes) {
            setProblem('Choose an image smaller than 15 MB.');
            return;
          }
          setProblem(undefined);
          setEditingFile(file);
        }}
      />
      {editingFile && (
        <ImageCropDialog
          file={editingFile}
          title={label}
          kind={kind}
          onClose={() => setEditingFile(undefined)}
          onSave={async (image) => {
            await onChoose(image);
            setEditingFile(undefined);
          }}
        />
      )}
    </div>
  );
}
