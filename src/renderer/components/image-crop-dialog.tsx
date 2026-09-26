import { useEffect, useRef, useState, type PointerEvent, type KeyboardEvent } from 'react';
import { Minus, Plus } from 'lucide-react';
import { Modal } from './modal';
import { toSquareImage, type SquareCrop } from '../infrastructure/square-image';

interface ImageCropDialogProps {
  file: File;
  title: string;
  onClose(): void;
  onSave(image: Blob): Promise<void>;
}

interface ImageSize {
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

/** Lets somebody choose the square that will become their avatar. */
export function ImageCropDialog({ file, title, onClose, onSave }: ImageCropDialogProps) {
  const frameRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState | undefined>(undefined);
  const [sourceUrl, setSourceUrl] = useState('');
  const [imageSize, setImageSize] = useState<ImageSize>();
  // The editor is capped at 17rem (272px). Starting with that measured design
  // size lets the image paint immediately; ResizeObserver replaces it with the
  // actual width on narrower windows.
  const [frameSide, setFrameSide] = useState(272);
  const [offset, setOffset] = useState<Offset>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');

  useEffect(() => {
    const url = URL.createObjectURL(file);
    setSourceUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return undefined;
    const measure = () => {
      const width = frame.clientWidth || frame.getBoundingClientRect().width;
      if (width > 0) setFrameSide(width);
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

  const scale = imageSize && frameSide
    ? Math.max(frameSide / imageSize.width, frameSide / imageSize.height) * zoom
    : 0;
  const renderedWidth = imageSize ? imageSize.width * scale : 0;
  const renderedHeight = imageSize ? imageSize.height * scale : 0;
  const maxOffsetX = Math.max(0, (renderedWidth - frameSide) / 2);
  const maxOffsetY = Math.max(0, (renderedHeight - frameSide) / 2);

  const setZoomLevel = (nextZoom: number) => {
    const next = clamp(nextZoom, 1, 3);
    if (!imageSize || !frameSide) {
      setZoom(next);
      return;
    }
    const nextScale = Math.max(frameSide / imageSize.width, frameSide / imageSize.height) * next;
    const nextMaxX = Math.max(0, (imageSize.width * nextScale - frameSide) / 2);
    const nextMaxY = Math.max(0, (imageSize.height * nextScale - frameSide) / 2);
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

  const crop = (): SquareCrop | undefined => {
    if (!imageSize || !frameSide || !scale) return undefined;
    const size = frameSide / scale;
    return {
      x: clamp(-((frameSide - renderedWidth) / 2 + offset.x) / scale, 0, imageSize.width - size),
      y: clamp(-((frameSide - renderedHeight) / 2 + offset.y) / scale, 0, imageSize.height - size),
      size,
    };
  };

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (!imageSize || busy || event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      offset,
    };
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
    try {
      await onSave(await toSquareImage(file, selectedCrop));
    } catch (error) {
      setProblem(error instanceof Error ? error.message : 'That picture could not be saved.');
    } finally {
      setBusy(false);
    }
  };

  const selectedCrop = crop();
  const previewSize = 44;

  return (
    <Modal
      title={`Add ${title.toLowerCase()}`}
      onClose={onClose}
      contentClassName="w-[min(34rem,calc(100vw-2rem))]"
      bodyClassName="space-y-4 px-5 py-4 sm:px-6"
    >
      <p className="text-center text-xs text-muted-foreground">
        Drag to reposition. Adjust the zoom until it looks right.
      </p>

      <div
        ref={frameRef}
        className="relative mx-auto aspect-square w-full max-w-[17rem] touch-none overflow-hidden rounded-xl border border-border bg-background"
        role="group"
        aria-label="Image crop area"
        aria-describedby="crop-instructions"
        tabIndex={0}
        onKeyDown={onCropKeyDown}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={() => { dragRef.current = undefined; }}
        onPointerCancel={() => { dragRef.current = undefined; }}
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
              const frameWidth = frame?.clientWidth || frame?.getBoundingClientRect().width;
              if (frameWidth) setFrameSide(frameWidth);
            }}
            onError={() => setProblem('That picture could not be read.')}
            className="pointer-events-none absolute max-w-none select-none"
            style={{
              width: renderedWidth,
              height: renderedHeight,
              left: (frameSide - renderedWidth) / 2 + offset.x,
              top: (frameSide - renderedHeight) / 2 + offset.y,
            }}
          />
        )}
        <div
          className="pointer-events-none absolute inset-0"
          style={{ background: 'radial-gradient(circle, transparent 48%, rgb(0 0 0 / 0.58) 50%)' }}
          aria-hidden="true"
        />
        <div className="pointer-events-none absolute inset-[1px] rounded-full border border-white/90 shadow-[0_0_0_1px_rgb(0_0_0_/_0.35)]" aria-hidden="true" />
        {!imageSize && (
          <span className="absolute inset-0 grid place-items-center text-xs text-muted-foreground">
            Loading picture…
          </span>
        )}
      </div>
      <p id="crop-instructions" className="-mt-2 text-center text-[11px] text-muted-foreground">
        Use the mouse or arrow keys to move the picture.
      </p>

      <div className="mx-auto flex w-full max-w-[17rem] items-center gap-3">
        <button
          type="button"
          className="grid size-8 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
          aria-label="Zoom out"
          disabled={zoom <= 1 || busy}
          onClick={() => setZoomLevel(zoom - 0.1)}
        >
          <Minus size={15} aria-hidden="true" />
        </button>
        <label className="flex min-w-0 flex-1 items-center gap-2 text-[11px] text-muted-foreground">
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

      {selectedCrop && imageSize && sourceUrl && (
        <div className="mx-auto flex w-full max-w-[17rem] items-center justify-between border-t border-border/70 pt-3">
          <span className="text-[11px] text-muted-foreground">Preview</span>
          <div className="flex items-center gap-3">
            {[{ shape: 'rounded-full', label: 'Round' }, { shape: 'rounded-xl', label: 'Square' }].map((preview) => (
              <div className="flex flex-col items-center gap-1" key={preview.label}>
                <span className={`relative block size-11 overflow-hidden bg-secondary ${preview.shape}`}>
                  <img
                    src={sourceUrl}
                    alt=""
                    className="absolute max-w-none select-none"
                    draggable={false}
                    style={{
                      width: (previewSize * imageSize.width) / selectedCrop.size,
                      height: (previewSize * imageSize.height) / selectedCrop.size,
                      left: (-previewSize * selectedCrop.x) / selectedCrop.size,
                      top: (-previewSize * selectedCrop.y) / selectedCrop.size,
                    }}
                  />
                </span>
                <span className="text-[10px] text-muted-foreground">{preview.label}</span>
              </div>
            ))}
          </div>
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
          {busy ? 'Saving…' : 'Save picture'}
        </button>
      </footer>
    </Modal>
  );
}
