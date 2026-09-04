export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}
export class CommunityClient {
  token = '';
  onUnauthorized?: () => void;
  constructor(public readonly url: string) {}
  async request<T>(path: string, method = 'GET', body?: unknown, signal?: AbortSignal): Promise<T> {
    const response = await fetch(`${this.url}${path}`, {
      method,
      signal,
      headers: {
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        ...(this.token ? { authorization: `Bearer ${this.token}` } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const data = (await response.json().catch(() => ({}))) as { error?: string };
    if (!response.ok) {
      if (response.status === 401 && !path.startsWith('/api/auth/')) this.onUnauthorized?.();
      throw new ApiError(response.status, data.error ?? 'The server could not complete this request.');
    }
    return data as T;
  }

  /** Reads a picture, which never arrives as JSON. */
  async blob(path: string): Promise<Blob> {
    const response = await fetch(`${this.url}${path}`, {
      headers: this.token ? { authorization: `Bearer ${this.token}` } : {},
    });
    if (!response.ok) {
      if (response.status === 401) this.onUnauthorized?.();
      throw new ApiError(response.status, 'That image is not available.');
    }
    return response.blob();
  }

  /** Sends a picture as its own bytes: no form, no file name, no envelope. */
  async upload<T>(path: string, image: Blob): Promise<T> {
    const response = await fetch(`${this.url}${path}`, {
      method: 'POST',
      headers: {
        'content-type': image.type,
        ...(this.token ? { authorization: `Bearer ${this.token}` } : {}),
      },
      body: image,
    });
    const data = (await response.json().catch(() => ({}))) as { error?: string };
    if (!response.ok) {
      if (response.status === 401) this.onUnauthorized?.();
      throw new ApiError(response.status, data.error ?? 'That image could not be saved.');
    }
    return data as T;
  }
}
