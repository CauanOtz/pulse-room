import type { CommunityClient } from './community-client';

/**
 * Fetches pictures once and keeps them for the life of the session.
 *
 * An address is the hash of the content, so a picture behind one can never
 * change: caching it forever is not a risk but the point of the design. The
 * request carries the session, because the service will not hand a picture to
 * somebody who shares no room with its owner.
 */
export class ImageCache {
  private readonly pending = new Map<string, Promise<string>>();

  constructor(private readonly api: CommunityClient) {}

  url(id: string): Promise<string> {
    const cached = this.pending.get(id);
    if (cached) return cached;

    const request = this.fetch(id).catch((error: unknown) => {
      this.pending.delete(id);
      throw error;
    });
    this.pending.set(id, request);
    return request;
  }

  clear(): void {
    this.pending.forEach((request) => void request.then(URL.revokeObjectURL).catch(() => undefined));
    this.pending.clear();
  }

  private async fetch(id: string): Promise<string> {
    const response = await this.api.blob(`/api/images/${id}`);
    return URL.createObjectURL(response);
  }
}
