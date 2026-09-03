import { afterEach, expect, it, vi } from 'vitest';
import { CommunityClient } from '../../src/renderer/infrastructure/community-client';

afterEach(() => vi.unstubAllGlobals());
it('sends individual session credentials but no JSON content type without a body', async () => {
  const fetch = vi.fn(async () => ({ ok: true, json: async () => ({ ok: true }) }));
  vi.stubGlobal('fetch', fetch);
  const api = new CommunityClient('https://api.example.com');
  api.token = 'individual-session';
  await api.request('/api/auth/logout', 'POST');
  expect(fetch).toHaveBeenCalledWith(
    'https://api.example.com/api/auth/logout',
    expect.objectContaining({
      headers: { authorization: 'Bearer individual-session' },
      method: 'POST',
    }),
  );
});
it('expires the account session on a protected API 401, but not a bad-password response', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ ok: false, status: 401, json: async () => ({ error: 'Unauthorized' }) })),
  );
  const api = new CommunityClient('https://api.example.com');
  api.onUnauthorized = vi.fn();
  await expect(api.request('/api/auth/login', 'POST', {})).rejects.toThrow('Unauthorized');
  expect(api.onUnauthorized).not.toHaveBeenCalled();
  await expect(api.request('/api/servers')).rejects.toThrow('Unauthorized');
  expect(api.onUnauthorized).toHaveBeenCalledOnce();
});
