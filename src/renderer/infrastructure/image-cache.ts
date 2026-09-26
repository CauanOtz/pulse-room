import type { CommunityClient } from './community-client';

interface Fetched {
  url: string;
  animated: boolean;
  blob: Blob;
}

/**
 * Fetches pictures once and keeps them for the life of the session.
 *
 * An address is the hash of the content, so a picture behind one can never
 * change: caching it forever is not a risk but the point of the design. The
 * request carries the session, because the service will not hand a picture to
 * somebody who shares no room with its owner.
 *
 * An animated picture is also kept still. A list of people is drawn with their
 * first frame and only moves the one under the pointer, because ten GIFs
 * playing at once in a window that sits beside a game is ten GIFs too many.
 * The still frame is made here, from the bytes already fetched: the service
 * never decodes a picture, so it has no first frame to offer.
 */
export class ImageCache {
  private readonly pending = new Map<string, Promise<Fetched>>();
  private readonly stills = new Map<string, Promise<string>>();

  constructor(private readonly api: CommunityClient) {}

  /** The picture as it was uploaded, moving if it moves. */
  async url(id: string): Promise<string> {
    return (await this.fetched(id)).url;
  }

  async isAnimated(id: string): Promise<boolean> {
    return (await this.fetched(id)).animated;
  }

  /** The first frame of a moving picture, or the picture itself if it is still. */
  still(id: string): Promise<string> {
    const cached = this.stills.get(id);
    if (cached) return cached;
    const request = this.fetched(id)
      .then((picture) => (picture.animated ? firstFrame(picture.blob).catch(() => picture.url) : picture.url))
      .catch((error: unknown) => {
        this.stills.delete(id);
        throw error;
      });
    this.stills.set(id, request);
    return request;
  }

  clear(): void {
    this.pending.forEach((request) => void request.then(({ url }) => URL.revokeObjectURL(url)).catch(() => undefined));
    this.stills.forEach((request) => void request.then(URL.revokeObjectURL).catch(() => undefined));
    this.pending.clear();
    this.stills.clear();
  }

  private fetched(id: string): Promise<Fetched> {
    const cached = this.pending.get(id);
    if (cached) return cached;

    const request = this.fetch(id).catch((error: unknown) => {
      this.pending.delete(id);
      throw error;
    });
    this.pending.set(id, request);
    return request;
  }

  private async fetch(id: string): Promise<Fetched> {
    const blob = await this.api.blob(`/api/images/${id}`);
    return { blob, url: URL.createObjectURL(blob), animated: blob.type === 'image/gif' };
  }
}

/** Draws the first frame of an animation into a picture of its own. */
async function firstFrame(blob: Blob): Promise<string> {
  const bitmap = await createImageBitmap(blob);
  try {
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    canvas.getContext('2d')?.drawImage(bitmap, 0, 0);
    const still = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (!still) throw new Error('No still frame.');
    return URL.createObjectURL(still);
  } finally {
    bitmap.close();
  }
}
