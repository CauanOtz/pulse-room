import { GIFEncoder, applyPalette, quantize } from 'gifenc';

/** A rectangle of the source picture, in its own pixels. */
export interface Crop {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** What a picture is for decides its shape and what it may cost. */
export type PictureKind = 'avatar' | 'icon' | 'banner';

interface Shape {
  /** Width over height. */
  aspect: number;
  still: { width: number; height: number; maxBytes: number };
  animated: { width: number; height: number; maxBytes: number; maxFrames: number };
}

/**
 * The shapes the service accepts, drawn a little inside its limits so a
 * picture prepared here is never refused there.
 *
 * An animated picture is drawn smaller than a still one: every frame is its
 * own picture, and a banner that played for four seconds at the still size
 * would be forty times the file for a card nobody looks at that closely.
 */
export const shapes: Record<PictureKind, Shape> = {
  avatar: {
    aspect: 1,
    still: { width: 256, height: 256, maxBytes: 262_144 },
    animated: { width: 256, height: 256, maxBytes: 5_000_000, maxFrames: 200 },
  },
  icon: {
    aspect: 1,
    still: { width: 256, height: 256, maxBytes: 262_144 },
    animated: { width: 256, height: 256, maxBytes: 5_000_000, maxFrames: 200 },
  },
  banner: {
    aspect: 2.5,
    still: { width: 900, height: 360, maxBytes: 1_000_000 },
    animated: { width: 600, height: 240, maxBytes: 8_000_000, maxFrames: 150 },
  },
};

export const maxSourceBytes = 15 * 1024 * 1024;
export const acceptedTypes = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];

/** A reason a picture was refused, worded for the person who chose it. */
export class PictureError extends Error {}

/** What happens while a picture is being prepared, for anybody watching. */
export type Progress = (fraction: number) => void;

/**
 * Whether a file is a moving picture. Only GIF and WebP can be, and only when
 * they hold more than one frame: a GIF with a single frame is a still picture
 * in an old format, and is treated as one.
 */
export async function isAnimated(file: Blob): Promise<boolean> {
  if (file.type !== 'image/gif' && file.type !== 'image/webp') return false;
  if (typeof ImageDecoder === 'undefined') return false;
  const decoder = new ImageDecoder({ data: await file.arrayBuffer(), type: file.type });
  try {
    await decoder.tracks.ready;
    await decoder.completed;
    return (decoder.tracks.selectedTrack?.frameCount ?? 1) > 1;
  } catch {
    return false;
  } finally {
    decoder.close();
  }
}

/**
 * Crops a picture and turns it into what the service accepts.
 *
 * The work happens here rather than on the service so that no image decoder
 * ever runs on the server. Re-encoding also drops the metadata a camera
 * writes, so nobody publishes the place a photograph was taken by accident.
 */
export async function preparePicture(
  file: Blob,
  crop: Crop,
  kind: PictureKind,
  onProgress?: Progress,
): Promise<Blob> {
  if (file.size > maxSourceBytes) throw new PictureError('Choose an image smaller than 15 MB.');
  if (!acceptedTypes.includes(file.type)) throw new PictureError('Choose a PNG, JPEG, WebP or GIF picture.');
  return (await isAnimated(file))
    ? prepareAnimation(file, crop, kind, onProgress)
    : prepareStill(file, crop, kind);
}

/** The crop has to lie inside the picture it came from, or it is a mistake. */
export function checkCrop(crop: Crop, width: number, height: number): void {
  const inside =
    [crop.x, crop.y, crop.width, crop.height].every(Number.isFinite) &&
    crop.x >= 0 &&
    crop.y >= 0 &&
    crop.width > 0 &&
    crop.height > 0 &&
    crop.x + crop.width <= width + 0.01 &&
    crop.y + crop.height <= height + 0.01;
  if (!inside) throw new PictureError('That crop is outside the picture. Adjust it and try again.');
}

async function prepareStill(file: Blob, crop: Crop, kind: PictureKind): Promise<Blob> {
  const { width, height, maxBytes } = shapes[kind].still;
  const source = await createImageBitmap(file).catch(() => {
    throw new PictureError('That picture could not be read.');
  });
  try {
    checkCrop(crop, source.width, source.height);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) throw new PictureError('This machine cannot prepare the picture.');
    context.imageSmoothingQuality = 'high';
    context.drawImage(source, crop.x, crop.y, crop.width, crop.height, 0, 0, width, height);

    for (const quality of [0.9, 0.8, 0.7, 0.6, 0.5]) {
      const encoded = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/webp', quality));
      if (!encoded) continue;
      // A machine that cannot write WebP hands back PNG whatever it is asked.
      if (encoded.size <= maxBytes) return encoded;
      if (encoded.type !== 'image/webp') break;
    }
    const png = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (png && png.size <= maxBytes) return png;
    throw new PictureError('That picture is too detailed to fit. Try a simpler one.');
  } finally {
    source.close();
  }
}

export interface SampledFrame {
  /** Which source frame is drawn. */
  index: number;
  /** For how long, in milliseconds. */
  duration: number;
}

/**
 * The shortest delay a GIF can hold that every player honours. Anything
 * shorter is read by browsers as a tenth of a second, which would make a fast
 * animation run five times too slowly.
 */
export const minimumDelay = 20;

/**
 * Chooses at most `budget` frames from an animation without changing how long
 * it plays. A dropped frame hands its time to the frame kept before it, so a
 * three-second GIF is still three seconds long with half its frames.
 */
export function sampleFrames(durations: number[], budget: number): SampledFrame[] {
  if (durations.length === 0) return [];
  const step = Math.max(1, durations.length / Math.max(1, budget));
  const kept: SampledFrame[] = [];
  let next = 0;
  for (let index = 0; index < durations.length; index += 1) {
    const duration = Math.max(0, durations[index] || 0);
    if (index >= next || kept.length === 0) {
      kept.push({ index, duration });
      next += step;
    } else {
      kept[kept.length - 1].duration += duration;
    }
  }
  return kept.map((frame) => ({ ...frame, duration: Math.max(minimumDelay, Math.round(frame.duration)) }));
}

/** The palette entry GIF will treat as see-through, if the frame has one. */
export function transparentIndex(palette: number[][]): number {
  return palette.findIndex((colour) => colour.length > 3 && colour[3] === 0);
}

/**
 * Crops every frame of an animation and writes it back out as a GIF.
 *
 * ImageDecoder hands back frames already composed, so disposal and blending
 * are the browser's problem rather than this code's. Each frame is drawn
 * through the crop, reduced to a palette and written with the time it was on
 * screen. If the result is too large to keep, it is tried again with fewer
 * colours, then with fewer frames, before giving up.
 */
async function prepareAnimation(file: Blob, crop: Crop, kind: PictureKind, onProgress?: Progress): Promise<Blob> {
  const { width, height, maxBytes, maxFrames } = shapes[kind].animated;
  const decoder = new ImageDecoder({ data: await file.arrayBuffer(), type: file.type });
  try {
    await decoder.tracks.ready;
    await decoder.completed;
    const track = decoder.tracks.selectedTrack;
    if (!track) throw new PictureError('That animation could not be read.');

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) throw new PictureError('This machine cannot prepare the picture.');
    context.imageSmoothingQuality = 'high';

    // Every frame, cropped and at its final size, decoded once and reused by
    // every attempt at fitting the file under its limit.
    const frames: ImageData[] = [];
    const durations: number[] = [];
    for (let index = 0; index < track.frameCount; index += 1) {
      const { image } = await decoder.decode({ frameIndex: index });
      try {
        if (index === 0) checkCrop(crop, image.displayWidth, image.displayHeight);
        context.clearRect(0, 0, width, height);
        context.drawImage(image, crop.x, crop.y, crop.width, crop.height, 0, 0, width, height);
        frames.push(context.getImageData(0, 0, width, height));
        // Microseconds, and absent on a frame that never said.
        durations.push((image.duration ?? 100_000) / 1000);
      } finally {
        image.close();
      }
      onProgress?.((0.5 * (index + 1)) / track.frameCount);
    }

    const attempts = [
      { colours: 256, budget: maxFrames },
      { colours: 128, budget: maxFrames },
      { colours: 64, budget: Math.ceil(maxFrames / 2) },
      { colours: 32, budget: Math.ceil(maxFrames / 3) },
    ];
    for (const [attempt, { colours, budget }] of attempts.entries()) {
      const chosen = sampleFrames(durations, budget);
      const encoder = GIFEncoder();
      for (const [position, frame] of chosen.entries()) {
        const { data } = frames[frame.index];
        const palette = quantize(data, colours, { format: 'rgba4444', oneBitAlpha: true });
        const index = applyPalette(data, palette, 'rgba4444');
        const clear = transparentIndex(palette);
        encoder.writeFrame(index, width, height, {
          palette,
          delay: frame.duration,
          transparent: clear >= 0,
          transparentIndex: Math.max(0, clear),
          // Loop forever, as every GIF a person would choose does.
          repeat: 0,
        });
        onProgress?.(0.5 + (0.5 * (attempt + (position + 1) / chosen.length)) / attempts.length);
      }
      encoder.finish();
      const bytes = encoder.bytes();
      if (bytes.length <= maxBytes) {
        onProgress?.(1);
        return new Blob([bytes], { type: 'image/gif' });
      }
    }
    throw new PictureError('That animation is too large even after shrinking it. Try a shorter GIF.');
  } catch (error) {
    // A reason already worded for a person passes through; anything the
    // decoder threw on its own becomes one.
    if (error instanceof PictureError) throw error;
    throw new PictureError('That animation could not be read.');
  } finally {
    decoder.close();
  }
}
