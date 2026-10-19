import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useChannelResources } from '../../src/renderer/infrastructure/use-channel-resources';
import type { CommunityClient } from '../../src/renderer/infrastructure/community-client';
import type { ChannelMedia, CommunityChannel } from '../../src/shared/community';

afterEach(cleanup);
const channel = (id: string) => ({ id, name: id, type: 'text' }) as CommunityChannel;
const file = (id: string): ChannelMedia => ({
  id,
  name: `${id}.pdf`,
  mime: 'application/pdf',
  size: 10,
  messageId: id,
  authorName: 'Owner',
  createdAt: '2026-10-18T12:00:00Z',
});

describe('context panel collections', () => {
  it('keeps older pages across tab changes and clears them when the channel changes', async () => {
    const request = vi.fn(async (path: string) => ({
      media: [
        file(path.includes('/second/') ? 'second-file' : path.includes('before=') ? 'older' : 'latest'),
      ],
      links: [],
      nextBefore: path.includes('before=') ? undefined : 'cursor',
    }));
    const api = { request } as unknown as CommunityClient;
    const view = renderHook(({ id, active }) => useChannelResources(api, channel(id), 'media', 0, active), {
      initialProps: { id: 'first', active: true },
    });
    await waitFor(() => expect(view.result.current.media.map((file) => file.id)).toEqual(['latest']));
    await act(() => view.result.current.loadMore());
    expect(view.result.current.media.map((file) => file.id)).toEqual(['latest', 'older']);
    view.rerender({ id: 'first', active: false });
    expect(view.result.current.media).toHaveLength(2);
    view.rerender({ id: 'first', active: true });
    await waitFor(() => expect(request).toHaveBeenCalledTimes(3));
    expect(view.result.current.media).toHaveLength(2);
    view.rerender({ id: 'second', active: true });
    await waitFor(() => expect(view.result.current.media.map((file) => file.id)).toEqual(['second-file']));
    expect(view.result.current.media.some((file) => file.id === 'older')).toBe(false);
  });
  it('removes the collection when refreshed access is denied, including older pages', async () => {
    let denied = false;
    const api = {
      request: vi.fn(async () => {
        if (denied) throw new Error('Channel access denied.');
        return { media: [file('shared')], links: [], nextBefore: 'cursor' };
      }),
    } as unknown as CommunityClient;
    const view = renderHook(
      ({ active }) => useChannelResources(api, channel('private'), 'media', 0, active),
      { initialProps: { active: true } },
    );
    await waitFor(() => expect(view.result.current.media).toHaveLength(1));
    await act(() => view.result.current.loadMore());
    view.rerender({ active: false });
    denied = true;
    view.rerender({ active: true });
    await waitFor(() => expect(view.result.current.error).toBe('Channel access denied.'));
    expect(view.result.current.media).toEqual([]);
    expect(view.result.current.next).toBeUndefined();
  });
});
