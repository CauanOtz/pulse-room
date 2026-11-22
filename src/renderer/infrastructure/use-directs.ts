import { useCallback, useEffect, useState } from 'react';
import type { DirectConversation } from '../../shared/community';
import { ApiError, type CommunityClient } from './community-client';
import type { LiveConnection } from './live-connection';
import { paced, poll } from './live-context';

const pollMs = 6_000;

export interface DirectsState {
  conversations: DirectConversation[];
  /** Messages waiting across every conversation. */
  unread: number;
  /** False against an older server that has no direct messages. */
  supported: boolean;
  refresh(): Promise<void>;
}

/** The list of conversations, read again when the server says it changed. */
export function useDirects(api: CommunityClient, signedIn: boolean, live?: LiveConnection): DirectsState {
  const [conversations, setConversations] = useState<DirectConversation[]>([]);
  const [supported, setSupported] = useState(true);

  const refresh = useCallback(async () => {
    if (!signedIn) return;
    try {
      const result = await api.request<{ conversations: DirectConversation[] }>('/api/directs');
      setConversations(result.conversations);
      setSupported(true);
    } catch (problem) {
      if (problem instanceof ApiError && problem.status === 404) setSupported(false);
    }
  }, [api, signedIn]);

  useEffect(() => {
    if (!signedIn) {
      setConversations([]);
      return undefined;
    }
    const poller = poll(refresh, paced(live, pollMs));
    const unlisten = live?.listen((event) => {
      if (event.type === 'sync' || event.type === 'directs') poller.kick();
      if (event.type === 'status')
        setConversations((current) =>
          current.some((item) => item.peer.id === event.userId && item.peer.online !== event.online)
            ? current.map((item) =>
                item.peer.id === event.userId ? { ...item, peer: { ...item.peer, online: event.online } } : item,
              )
            : current,
        );
    });
    const wake = () => poller.kick();
    window.addEventListener('focus', wake);
    return () => {
      unlisten?.();
      poller.stop();
      window.removeEventListener('focus', wake);
    };
  }, [refresh, signedIn, live]);

  return {
    conversations,
    unread: conversations.reduce((total, conversation) => total + conversation.unread, 0),
    supported,
    refresh,
  };
}
