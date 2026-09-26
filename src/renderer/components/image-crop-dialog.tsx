import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { Minus, Plus } from 'lucide-react';
import { Modal } from './modal';
import { isAnimated, preparePicture, shapes, type Crop, type PictureKind } from '../infrastructure/prepare-image';

interface ImageCropDialogProps {
  file: File;
  title: string;
  kind?: PictureKind;
  onClose(): void;
  onSave(image: Blob): Promise<void>;
}

interface Size {
  width: number;
  height: number;
}

interface Offset {
  x: number;
  y: number;
}

interface DragState {
  pointerId: number;
  x: number;
  y: number;
  offset: Offset;
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/** The largest the editor is drawn, before a narrow window shrinks it. */
const frameWidths: Record<PictureKind, number> = { avatar: 272, icon: 272, banner: 460 };

/**
 * Lets somebody choose the part of a picture that will be kept.
 *
 * A face is a square seen through a circle; a banner is a wide strip seen whole.
 * An animated picture is shown moving while it is framed, because the frame
 * that matters is rarely the first one.
 */
export function ImageCropDialog({ file, title, kind = 'avatar', onClose, onSave }: ImageCropDialogProps) {
  const aspect = shapes[kind].aspect;
  const round = kind === 'avatar';
  const frameRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState | undefined>(undefined);
  const [sourceUrl, setSourceUrl] = useState('');
  const [imageSize, setImageSize] = useState<Size>();
  const [frameWidth, setFrameWidth] = useState(frameWidths[kind]);
  const frameHeight = frameWidth / aspect;
  const [offset, setOffset] = useState<Offset>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [moving, setMoving] = useState(false);
  const [problem, setProblem] = useState('');

  useEffect(() => {
    const url = URL.createObjectURL(file);
    setSourceUrl(url);
    let current = true;
    void isAnimated(file).then((animated) => current && setMoving(animated));
    return () => {
      current = false;
      URL.revokeObjectURL(url);
    };
  }, [file]);

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return undefined;
    const measure = () => {
      const width = frame.clientWidth || frame.getBoundingClientRect().width;
      if (width > 0) setFrameWidth(width);
    };
    const observer = new ResizeObserver(measure);
    observer.observe(frame);
    measure();
    window.addEventListener('resize', measure);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, []);

  // The picture always covers the frame: at zoom one, its shorter side fits.
  const coverScale = (size: Size) => Math.max(frameWidth / size.width, frameHeight / size.height);
  const scale = imageSize && frameWidth ? coverScale(imageSize) * zoom : 0;
  const renderedWidth = imageSize ? imageSize.width * scale : 0;
  const renderedHeight = imageSize ? imageSize.height * scale : 0;
  const maxOffsetX = Math.max(0, (renderedWidth - frameWidth) / 2);
  const maxOffsetY = Math.max(0, (renderedHeight - frameHeight) / 2);

  const setZoomLevel = (nextZoom: number) => {
    const next = clamp(nextZoom, 1, 3);
    if (!imageSize || !frameWidth) {
      setZoom(next);
      return;
    }
    const nextScale = coverScale(imageSize) * next;
    const nextMaxX = Math.max(0, (imageSize.width * nextScale - frameWidth) / 2);
    const nextMaxY = Math.max(0, (imageSize.height * nextScale - frameHeight) / 2);
    setOffset((current) => ({
      x: clamp(current.x, -nextMaxX, nextMaxX),
      y: clamp(current.y, -nextMaxY, nextMaxY),
    }));
    setZoom(next);
  };

  const moveBy = (x: number, y: number) => {
    setOffset((current) => ({
      x: clamp(current.x + x, -maxOffsetX, maxOffsetX),
      y: clamp(current.y + y, -maxOffsetY, maxOffsetY),
    }));
  };

  /** The frame, translated back into the source picture's own pixels. */
  const crop = (): Crop | undefined => {
    if (!imageSize || !frameWidth || !scale) return undefined;
    const width = frameWidth / scale;
    const height = frameHeight / scale;
    return {
      x: clamp(-((frameWidth - renderedWidth) / 2 + offset.x) / scale, 0, imageSize.width - width),
      y: clamp(-((frameHeight - renderedHeight) / 2 + offset.y) / scale, 0, imageSize.height - height),
      width,
      height,
    };
  };

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (!imageSize || busy || event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, offset };
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    setOffset({
      x: clamp(drag.offset.x + event.clientX - drag.x, -maxOffsetX, maxOffsetX),
      y: clamp(drag.offset.y + event.clientY - drag.y, -maxOffsetY, maxOffsetY),
    });
  };

  const onCropKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = event.shiftKey ? 20 : 6;
    const directions: Record<string, Offset> = {
      ArrowUp: { x: 0, y: -step },
      ArrowDown: { x: 0, y: step },
      ArrowLeft: { x: -step, y: 0 },
      ArrowRight: { x: step, y: 0 },
    };
    const movement = directions[event.key];
    if (!movement) return;
    event.preventDefault();
    moveBy(movement.x, movement.y);
  };

  const save = async () => {
    const selectedCrop = crop();
    if (!selectedCrop) return;
    setBusy(true);
    setProblem('');
    setProgress(0);
    try {
      await onSave(await preparePicture(file, selectedCrop, kind, setProgress));
    } catch (error) {
      setProblem(error instanceof Error ? error.message : 'That picture could not be saved.');
    } finally {
      setBusy(false);
    }
  };

  const selectedCrop = crop();
  const maxWidth = `${frameWidths[kind] / 16}rem`;

  return (
    <Modal
      title={`Add ${title.toLowerCase()}`}
      onClose={busy ? () => undefined : onClose}
      contentClassName={kind === 'banner' ? 'w-[min(38rem,calc(100vw-2rem))]' : 'w-[min(34rem,calc(100vw-2rem))]'}
      bodyClassName="space-y-4 px-5 py-4 sm:px-6"
    >
      <p className="text-center text-xs text-muted-foreground">
        Drag to reposition. Adjust the zoom until it looks right.
        {moving && <span className="crop-animated"> This one moves, and it will keep moving.</span>}
      </p>

      <div
        ref={frameRef}
        className="relative mx-auto w-full touch-none overflow-hidden rounded-xl border border-border bg-background"
        style={{ maxWidth, aspectRatio: String(aspect) }}
        role="group"
        aria-label="Image crop area"
        aria-describedby="crop-instructions"
        tabIndex={0}
        onKeyDown={onCropKeyDown}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={() => {
          dragRef.current = undefined;
        }}
        onPointerCancel={() => {
          dragRef.current = undefined;
        }}
      >
        {sourceUrl && (
          <img
            src={sourceUrl}
            alt=""
            draggable={false}
            onLoad={(event) => {
              const { naturalWidth: width, naturalHeight: height } = event.currentTarget;
              if (!width || !height) {
                setProblem('That picture could not be read.');
                return;
              }
              setImageSize({ width, height });
              const frame = frameRef.current;
              const measured = frame?.clientWidth || frame?.getBoundingClientRect().width;
              if (measured) setFrameWidth(measured);
            }}
            onError={() => setProblem('That picture could not be read.')}
            className="pointer-events-none absolute max-w-none select-none"
            style={{
              width: renderedWidth,
              height: renderedHeight,
              left: (frameWidth - renderedWidth) / 2 + offset.x,
              top: (frameHeight - renderedHeight) / 2 + offset.y,
            }}
          />
        )}
        {round && (
          <>
            <div
              className="pointer-events-none absolute inset-0"
              style={{ background: 'radial-gradient(circle, transparent 48%, rgb(0 0 0 / 0.58) 50%)' }}
              aria-hidden="true"
            />
            <div
              className="pointer-events-none absolute inset-[1px] rounded-full border border-white/90 shadow-[0_0_0_1px_rgb(0_0_0_/_0.35)]"
              aria-hidden="true"
            />
          </>
        )}
        {!imageSize && (
          <span className="absolute inset-0 grid place-items-center text-xs text-muted-foreground">
            Loading picture…
          </span>
        )}
      </div>
      <p id="crop-instructions" className="-mt-2 text-center text-[11px] text-muted-foreground">
        Use the mouse or arrow keys to move the picture.
      </p>

      <div className="mx-auto flex w-full items-center gap-3" style={{ maxWidth }}>
        <button
          type="button"
          className="grid size-8 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
          aria-label="Zoom out"
          disabled={zoom <= 1 || busy}
          onClick={() => setZoomLevel(zoom - 0.1)}
        >
          <Minus size={15} aria-hidden="true" />
        </button>
        {/* A row, said explicitly: the dialog's own form rules stack a label's
            contents in a column, which folded the slider under its caption. */}
        <label className="flex min-w-0 flex-1 flex-row items-center gap-2 text-[11px] text-muted-foreground">
          <span className="shrink-0">Zoom</span>
          <input
            className="min-w-0 flex-1 accent-foreground"
            type="range"
            min="1"
            max="3"
            step="0.05"
            value={zoom}
            aria-label="Zoom image"
            disabled={!imageSize || busy}
            onChange={(event) => setZoomLevel(Number(event.target.value))}
          />
          <span className="w-9 shrink-0 text-right tabular-nums">{Math.round(zoom * 100)}%</span>
        </label>
        <button
          type="button"
          className="grid size-8 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
          aria-label="Zoom in"
          disabled={zoom >= 3 || busy}
          onClick={() => setZoomLevel(zoom + 0.1)}
        >
          <Plus size={15} aria-hidden="true" />
        </button>
      </div>

      {selectedCrop && imageSize && sourceUrl && kind !== 'banner' && (
        <div className="mx-auto flex w-full items-center justify-between border-t border-border/70 pt-3" style={{ maxWidth }}>
          <span className="text-[11px] text-muted-foreground">Preview</span>
          <div className="flex items-center gap-3">
            {[
              { shape: 'rounded-full', label: 'Round' },
              { shape: 'rounded-xl', label: 'Square' },
            ].map((preview) => (
              <div className="flex flex-col items-center gap-1" key={preview.label}>
                <span className={`relative block size-11 overflow-hidden bg-secondary ${preview.shape}`}>
                  <img
                    src={sourceUrl}
                    alt=""
                    className="absolute max-w-none select-none"
                    draggable={false}
                    style={{
                      width: (44 * imageSize.width) / selectedCrop.width,
                      height: (44 * imageSize.height) / selectedCrop.height,
                      left: (-44 * selectedCrop.x) / selectedCrop.width,
                      top: (-44 * selectedCrop.y) / selectedCrop.height,
                    }}
                  />
                </span>
                <span className="text-[10px] text-muted-foreground">{preview.label}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {busy && moving && (
        <div className="mx-auto w-full space-y-1.5" style={{ maxWidth }} role="status" aria-live="polite">
          <div className="h-1 overflow-hidden rounded-full bg-secondary">
            <div
              className="crop-progress h-full rounded-full bg-foreground transition-[width] duration-150"
              style={{ width: `${Math.round(progress * 100)}%` }}
            />
          </div>
          <p className="text-center text-[11px] text-muted-foreground">
            Preparing every frame… {Math.round(progress * 100)}%
          </p>
        </div>
      )}

      {problem && (
        <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive" role="alert">
          {problem}
        </p>
      )}

      <footer className="flex items-center justify-end gap-2 border-t border-border/70 pt-3">
        <button
          type="button"
          className="inline-flex h-9 items-center justify-center rounded-md px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onClick={onClose}
          disabled={busy}
        >
          Cancel
        </button>
        <button
          type="button"
          className="primary-action inline-flex h-9 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50"
          onClick={() => void save()}
          disabled={!imageSize || busy}
        >
          {busy ? 'Saving…' : kind === 'banner' ? 'Save banner' : 'Save picture'}
        </button>
      </footer>
    </Modal>
  );
}
