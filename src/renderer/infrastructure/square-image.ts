export const avatarSide = 256;
export const maxAvatarSourceBytes = 10 * 1024 * 1024;
export const maxAvatarOutputBytes = 262_144;

export interface SquareCrop {
  x: number;
  y: number;
  size: number;
}

/**
 * Turns whatever a person picked into the one shape the service accepts:
 * a square PNG or WebP, small enough to travel as a profile picture.
 *
 * The work happens here rather than on the service so that no image decoder
 * ever runs on the server. Re-encoding also drops the metadata a camera
 * writes, so nobody publishes the place a photograph was taken by accident.
 */
export async function toSquareImage(
  file: Blob,
  crop?: SquareCrop,
  side = avatarSide,
): Promise<Blob> {
  if (file.size > maxAvatarSourceBytes) throw new Error('Choose an image smaller than 10 MB.');
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type))
    throw new Error('Choose a PNG, JPEG or WebP picture.');

  const source = await createImageBitmap(file).catch(() => {
    throw new Error('That picture could not be read.');
  });
  try {
    const canvas = document.createElement('canvas');
    canvas.width = side;
    canvas.height = side;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('This machine cannot prepare the picture.');

    const square = crop ?? {
      x: (source.width - Math.min(source.width, source.height)) / 2,
      y: (source.height - Math.min(source.width, source.height)) / 2,
      size: Math.min(source.width, source.height),
    };
    if (
      !Number.isFinite(square.x) ||
      !Number.isFinite(square.y) ||
      !Number.isFinite(square.size) ||
      square.x < 0 ||
      square.y < 0 ||
      square.size <= 0 ||
      square.x + square.size > source.width + 0.01 ||
      square.y + square.size > source.height + 0.01
    ) {
      throw new Error('That crop is outside the picture. Adjust it and try again.');
    }

    context.drawImage(
      source,
      square.x,
      square.y,
      square.size,
      square.size,
      0,
      0,
      side,
      side,
    );

    for (const quality of [0.9, 0.8, 0.7, 0.6, 0.5]) {
      const encoded = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, 'image/webp', quality),
      );
      if (!encoded) continue;
      if (encoded.type !== 'image/webp') {
        if (encoded.size <= maxAvatarOutputBytes) return encoded;
        break;
      }
      if (encoded.size <= maxAvatarOutputBytes) return encoded;
    }

    const png = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (!png || png.size > maxAvatarOutputBytes)
      throw new Error('This picture is too detailed to upload. Try a smaller image or a tighter crop.');
    return png;
  } finally {
    source.close();
  }
}
