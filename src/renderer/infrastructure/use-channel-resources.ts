import { useEffect, useRef, useState } from 'react';
import type { ChannelResources, CommunityChannel } from '../../shared/community';
import type { CommunityClient } from './community-client';

const empty = (): ChannelResources => ({ media: [], links: [] });

/** The summary and gallery share one collection. Tab changes keep its pages. */
export function useChannelResources(
  api: CommunityClient | undefined,
  channel: CommunityChannel | undefined,
  kind: 'media' | 'links',
  revision = 0,
  active = true,
) {
  const base = channel ? `/api/channels/${channel.id}/resources?kind=${kind}` : '';
  const [refresh, setRefresh] = useState(0);
  const key = `${base}:${revision}:${refresh}`;
  const [collection, setCollection] = useState({ key, latest: empty(), older: empty(), paged: false });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const pageRequest = useRef<AbortController | undefined>(undefined);
  const currentKey = useRef(key);
  currentKey.current = key;
  useEffect(() => {
    pageRequest.current?.abort();
    setError('');
    return () => pageRequest.current?.abort();
  }, [key]);
  useEffect(() => {
    if (!api || !base || !active) return;
    const abort = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    setLoading(true);
    async function read() {
      try {
        const result = await api!.request<ChannelResources>(base, 'GET', undefined, abort.signal);
        if (!abort.signal.aborted) {
          setCollection((previous) => ({
            key,
            latest: result,
            older: previous.key === key ? previous.older : empty(),
            paged: previous.key === key && previous.paged,
          }));
          setError('');
        }
      } catch (error) {
        if (!abort.signal.aborted) {
          setCollection({ key, latest: empty(), older: empty(), paged: false });
          setError(error instanceof Error ? error.message : 'Shared content is unavailable.');
        }
      } finally {
        if (!abort.signal.aborted) {
          setLoading(false);
          timer = setTimeout(() => void read(), 8000);
        }
      }
    }
    void read();
    return () => {
      abort.abort();
      clearTimeout(timer);
    };
  }, [api, base, key, active]);
  const current = collection.key === key ? collection : { latest: empty(), older: empty(), paged: false };
  const media = [
    ...new Map([...current.latest.media, ...current.older.media].map((file) => [file.id, file])).values(),
  ];
  const links = [
    ...new Map(
      [...current.latest.links, ...current.older.links].map((link) => [
        `${link.messageId}:${link.url}`,
        link,
      ]),
    ).values(),
  ];
  const next = current.paged ? current.older.nextBefore : current.latest.nextBefore;
  async function loadMore() {
    if (!api || !next || loading || pageRequest.current) return;
    const abort = new AbortController();
    pageRequest.current = abort;
    setLoading(true);
    setError('');
    try {
      const result = await api.request<ChannelResources>(
        `${base}&before=${encodeURIComponent(next)}`,
        'GET',
        undefined,
        abort.signal,
      );
      if (abort.signal.aborted || currentKey.current !== key) return;
      setCollection((previous) => ({
        ...previous,
        paged: true,
        older: {
          media: [...previous.older.media, ...result.media],
          links: [...previous.older.links, ...result.links],
          nextBefore: result.nextBefore,
        },
      }));
    } catch (error) {
      if (!abort.signal.aborted && currentKey.current === key)
        setError(error instanceof Error ? error.message : 'Could not load older items.');
    } finally {
      if (pageRequest.current === abort) pageRequest.current = undefined;
      if (!abort.signal.aborted && currentKey.current === key) setLoading(false);
    }
  }
  return {
    media,
    links,
    next,
    loading: loading || (Boolean(api && channel && active) && collection.key !== key),
    error,
    loadMore,
    refresh: () => setRefresh((value) => value + 1),
  };
}

export type ResourceCollection = ReturnType<typeof useChannelResources>;
