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
}
