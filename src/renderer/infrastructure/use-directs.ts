import { useCallback, useEffect, useState } from 'react';
import type { DirectConversation } from '../../shared/community';
import { ApiError, type CommunityClient } from './community-client';

const pollMs = 6_000;

export interface DirectsState {
  conversations: DirectConversation[];
  /** Messages waiting across every conversation. */
  unread: number;
  /** False against an older server that has no direct messages. */
  supported: boolean;
  refresh(): Promise<void>;
}

/** The list of conversations, kept fresh by polling while signed in. */
export function useDirects(api: CommunityClient, signedIn: boolean): DirectsState {
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
    void refresh();
    const timer = setInterval(() => void refresh(), pollMs);
    const wake = () => void refresh();
    window.addEventListener('focus', wake);
    return () => {
      clearInterval(timer);
      window.removeEventListener('focus', wake);
    };
  }, [refresh, signedIn]);

  return {
    conversations,
    unread: conversations.reduce((total, conversation) => total + conversation.unread, 0),
    supported,
    refresh,
  };
}
