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
    <section className="text-chat flex min-h-0 min-w-0 flex-1 flex-col" aria-label={`${channel.name} chat`}>
      <div
        className="chat-history flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 py-4"
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
          <div className="chat-welcome mx-auto max-w-md py-10 text-center text-sm text-muted-foreground">
            <span>#</span>
            <h2>This is #{channel.name}</h2>
            <p>The start of your conversation. Only members with access can read it.</p>
          </div>
        )}
        {messages.map((message) => (
          <article className="chat-message flex items-start gap-3 text-sm" key={message.id}>
            <Avatar
              className="profile-avatar grid size-9 shrink-0 place-items-center rounded-xl bg-secondary text-[11px] font-bold text-secondary-foreground"
              name={message.authorName}
              imageId={avatars?.get(message.authorId)}
            />
            <div className="min-w-0 flex-1">
              <header className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                <strong className="text-sm font-semibold">{message.authorName}</strong>
                <time className="text-[11px] text-muted-foreground" dateTime={message.createdAt}>
                  {new Date(message.createdAt).toLocaleString()}
                </time>
                {(manager || message.authorId === user.id) && (
                  <button
                    className="ml-auto text-[11px] text-muted-foreground transition-colors hover:text-destructive"
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
        <p className="form-error rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive" role="alert">
          {error}
        </p>
      )}
      <form
        className="chat-composer flex items-end gap-2 border-t border-border px-4 py-3"
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
      >
        <textarea
          className="min-h-10 max-h-40 w-full flex-1 resize-none rounded-xl border border-input bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
          rows={1}
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
        <button className="primary-action inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50" disabled={busy || !draft.trim() || (channel.readOnly && !manager)}>
          Send
        </button>
      </form>
    </section>
  );
}
