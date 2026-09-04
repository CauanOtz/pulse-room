export const avatarSide = 256;

/**
 * Turns whatever a person picked into the one shape the service accepts:
 * a square PNG or WebP, small enough to travel as a profile picture.
 *
 * The work happens here rather than on the service so that no image decoder
 * ever runs on the server. Re-encoding also drops the metadata a camera
 * writes, so nobody publishes the place a photograph was taken by accident.
 */
export async function toSquareImage(file: Blob, side = avatarSide): Promise<Blob> {
  if (!file.type.startsWith('image/') || file.type === 'image/svg+xml')
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

    const crop = Math.min(source.width, source.height);
    context.drawImage(
      source,
      (source.width - crop) / 2,
      (source.height - crop) / 2,
      crop,
      crop,
      0,
      0,
      side,
      side,
    );

    const encoded = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/webp', 0.9),
    );
    if (encoded && encoded.type === 'image/webp') return encoded;

    const png = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (!png) throw new Error('That picture could not be prepared.');
    return png;
  } finally {
    source.close();
  }
}
