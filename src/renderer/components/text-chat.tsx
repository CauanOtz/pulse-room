import { Avatar } from './avatar';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Account, ChatMessage, CommunityChannel } from '../../shared/community';
import type { CommunityClient } from '../infrastructure/community-client';

export function TextChat({
  api,
  channel,
  user,
  manager,
  avatars,
}: {
  api: CommunityClient;
  channel: CommunityChannel;
  user: Account;
  manager: boolean;
  avatars?: ReadonlyMap<string, string | null | undefined>;
}) {
  const [latest, setLatest] = useState<ChatMessage[]>([]);
  const [history, setHistory] = useState<ChatMessage[]>([]);
  const messages = useMemo(() => {
    const unique = new Map([...history, ...latest].map((message) => [message.id, message]));
    return [...unique.values()].sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime() || a.id.localeCompare(b.id),
    );
  }, [history, latest]);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [more, setMore] = useState(true);
  const bottom = useRef<HTMLDivElement>(null);
  const scrollToEnd = useRef(true);
  const base = `/api/channels/${channel.id}/messages`;
  useEffect(() => {
    const abort = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const read = async () => {
      try {
        const result = await api.request<{ messages: ChatMessage[] }>(base, 'GET', undefined, abort.signal);
        if (!abort.signal.aborted) {
          setLatest(result.messages);
          setError('');
        }
      } catch (e) {
        if (!abort.signal.aborted) {
          setError(e instanceof Error ? e.message : 'Chat is unavailable.');
          setLatest([]);
          setHistory([]);
        }
      } finally {
        if (!abort.signal.aborted) timer = setTimeout(() => void read(), 3000);
      }
    };
    void read();
    return () => {
      abort.abort();
      clearTimeout(timer);
    };
  }, [api, base]);
  useEffect(() => {
    if (scrollToEnd.current) bottom.current?.scrollIntoView({ block: 'end' });
  }, [messages]);
  async function send() {
    if (!draft.trim() || busy) return;
    setBusy(true);
    setError('');
    try {
      await api.request(base, 'POST', { content: draft.trim() });
      setDraft('');
      const result = await api.request<{ messages: ChatMessage[] }>(base);
      setLatest(result.messages);
      scrollToEnd.current = true;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Message not sent.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="text-chat" aria-label={`${channel.name} chat`}>
      <div
        className="chat-history"
        onScroll={(e) => {
          const el = e.currentTarget;
          scrollToEnd.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
        }}
      >
        {messages.length >= 50 && more && (
          <button
            onClick={() =>
              void api
                .request<{ messages: ChatMessage[] }>(`${base}?before=${messages[0].id}`)
                .then((result) => {
                  setMore(result.messages.length === 50);
                  scrollToEnd.current = false;
                  setHistory((previous) => [...result.messages, ...previous]);
                })
                .catch((e) => setError(e.message))
            }
          >
            Load older messages
          </button>
        )}
        {!messages.length && !error && (
          <div className="chat-welcome">
            <span>#</span>
            <h2>This is #{channel.name}</h2>
            <p>The start of your conversation. Only members with access can read it.</p>
          </div>
        )}
        {messages.map((message) => (
          <article className="chat-message" key={message.id}>
            <Avatar
              className="profile-avatar"
              name={message.authorName}
              imageId={avatars?.get(message.authorId)}
            />
            <div>
              <header>
                <strong>{message.authorName}</strong>
                <time dateTime={message.createdAt}>{new Date(message.createdAt).toLocaleString()}</time>
                {(manager || message.authorId === user.id) && (
                  <button
                    aria-label={`Delete message from ${message.authorName}`}
                    onClick={() =>
                      void api
                        .request(`${base}/${message.id}`, 'DELETE')
                        .then(() => {
                          setLatest((previous) => previous.filter((m) => m.id !== message.id));
                          setHistory((previous) => previous.filter((m) => m.id !== message.id));
                        })
                        .catch((e) => setError(e.message))
                    }
                  >
                    Delete
                  </button>
                )}
              </header>
              <p>{message.content}</p>
            </div>
          </article>
        ))}
        <div ref={bottom} />
      </div>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <form
        className="chat-composer"
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
      >
        <textarea
          aria-label="Message"
          placeholder={
            channel.readOnly && !manager ? 'This channel is read-only.' : `Message #${channel.name}`
          }
          disabled={channel.readOnly && !manager}
          maxLength={2000}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              void send();
            }
          }}
        />
        <button className="primary-action" disabled={busy || !draft.trim() || (channel.readOnly && !manager)}>
          Send
        </button>
      </form>
    </section>
  );
}
