import { Hash, SendHorizontal, Trash2 } from 'lucide-react';
import { Avatar } from './avatar';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Tooltip } from './ui/tooltip';
import { cn } from './ui/utils';
import type { Account, ChatMessage, CommunityChannel } from '../../shared/community';
import type { CommunityClient } from '../infrastructure/community-client';

const clock = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' });
const calendar = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'long', year: 'numeric' });

/** Today and yesterday are said in words; everything older gets its date. */
export function dayOf(when: Date): string {
  const midnight = new Date();
  midnight.setHours(0, 0, 0, 0);
  const days = Math.floor((midnight.getTime() - when.getTime()) / 86_400_000);
  if (days < 0) return 'Today';
  if (days < 1) return 'Yesterday';
  return calendar.format(when);
}

/**
 * Whether a message carries its own heading, or joins the one above it.
 *
 * A run of messages from the same person inside a few minutes is one person
 * talking, and repeating their face and name four times says nothing that the
 * first one did not.
 */
export function startsRun(message: ChatMessage, previous: ChatMessage | undefined): boolean {
  if (!previous || previous.authorId !== message.authorId) return true;
  const gap = new Date(message.createdAt).getTime() - new Date(previous.createdAt).getTime();
  return !(gap >= 0 && gap < 5 * 60_000);
}

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
        className="chat-history flex min-h-0 flex-1 flex-col overflow-y-auto px-5 py-4"
        onScroll={(e) => {
          const el = e.currentTarget;
          scrollToEnd.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
        }}
      >
        {messages.length >= 50 && more && (
          <button
            className="mx-auto mb-2 rounded-lg px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            type="button"
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
        {/* Once the whole history is in hand, the top of the channel is the
            beginning of it, and says so the way a first page would. */}
        {!error && !(messages.length >= 50 && more) && (
          <div
            className={cn(
              'chat-welcome flex flex-col items-start gap-2 px-2 py-9',
              messages.length ? 'pb-4' : 'mt-auto',
            )}
          >
            <span className="grid size-10 place-items-center rounded-lg border border-border bg-secondary text-primary shadow-[var(--gloss)]">
              <Hash aria-hidden="true" className="size-5" />
            </span>
            <h2 className="text-[22px] font-bold tracking-[-0.025em]">Welcome to #{channel.name}</h2>
            <p className="text-sm text-muted-foreground">
              This is the beginning of the channel. Only members with access can read it.
            </p>
          </div>
        )}
        {messages.map((message, index) => {
          const previous = messages[index - 1];
          const when = new Date(message.createdAt);
          const dayBreak = !previous || dayOf(new Date(previous.createdAt)) !== dayOf(when);
          const heading = dayBreak || startsRun(message, previous);
          const mine = manager || message.authorId === user.id;
          return (
            <div key={message.id}>
              {dayBreak && (
                // A rule with the day sitting in it, so a night of talking is
                // read as nights rather than as one column.
                <div className="chat-day my-4 flex items-center gap-3" role="separator">
                  <span className="h-px flex-1 bg-border" />
                  <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                    {dayOf(when)}
                  </span>
                  <span className="h-px flex-1 bg-border" />
                </div>
              )}
              <article
                className={cn(
                  'chat-message group/message relative flex items-start gap-3 rounded-md px-2 text-sm transition-colors hover:bg-accent/55',
                  heading ? 'mt-3 py-1 first:mt-0' : 'py-px',
                )}
              >
                {heading ? (
                  <Avatar
                    className="profile-avatar mt-0.5 grid size-8.5 shrink-0 place-items-center rounded-[10px] bg-secondary text-[11px] font-bold text-secondary-foreground"
                    name={message.authorName}
                    imageId={avatars?.get(message.authorId)}
                  />
                ) : (
                  // The gutter keeps its width, and only gives up the hour to
                  // somebody who reaches for it.
                  <time
                    className="mt-0.5 w-9 shrink-0 pt-px text-right text-[10px] text-muted-foreground opacity-0 transition-opacity group-hover/message:opacity-100"
                    dateTime={message.createdAt}
                  >
                    {clock.format(when)}
                  </time>
                )}
                <div className="min-w-0 flex-1">
                  {heading && (
                    <header className="flex flex-wrap items-baseline gap-x-2">
                      <strong className="text-sm font-semibold text-foreground">{message.authorName}</strong>
                      <time className="text-[11px] text-muted-foreground" dateTime={message.createdAt}>
                        {dayOf(when)} at {clock.format(when)}
                      </time>
                    </header>
                  )}
                  <p className="whitespace-pre-wrap break-words text-[14.5px] leading-[1.45] text-foreground/90">
                    {message.content}
                  </p>
                </div>
                {mine && (
                  // The one destructive thing in the channel waits to be
                  // looked for, and says what it is when it is.
                  <Tooltip label="Delete message">
                    <button
                      className={cn(
                        'chat-delete absolute right-1 top-0 grid size-7 -translate-y-1/2 place-items-center rounded-md bg-popover text-muted-foreground opacity-0 shadow-[var(--gloss)]',
                        'transition-opacity hover:text-destructive group-hover/message:opacity-100 focus-visible:opacity-100',
                        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                      )}
                      type="button"
                      aria-label={`Delete message from ${message.authorName}`}
                      onClick={() =>
                        void api
                          .request(`${base}/${message.id}`, 'DELETE')
                          .then(() => {
                            setLatest((rest) => rest.filter((m) => m.id !== message.id));
                            setHistory((rest) => rest.filter((m) => m.id !== message.id));
                          })
                          .catch((e) => setError(e.message))
                      }
                    >
                      <Trash2 aria-hidden="true" className="size-3.5" />
                    </button>
                  </Tooltip>
                )}
              </article>
            </div>
          );
        })}
        <div ref={bottom} />
      </div>
      {error && (
        <p className="form-error rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive" role="alert">
          {error}
        </p>
      )}
      <form
        className="chat-composer flex items-end gap-2 border-t border-border px-4 py-2.5"
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
      >
        <textarea
          // Typing here is the ordinary thing to do in a channel, so the box
          // only warms a shade when it takes the keys. The caret says the rest.
          className="min-h-10 max-h-40 w-full flex-1 resize-none rounded-lg border border-input bg-secondary/45 px-3 py-2 text-sm text-foreground transition-colors placeholder:text-muted-foreground focus:border-primary/70 focus:bg-secondary focus-visible:outline-none disabled:opacity-60"
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
        <button className="primary-action grid size-10 shrink-0 place-items-center rounded-lg bg-primary text-primary-foreground transition-colors hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50" aria-label="Send" disabled={busy || !draft.trim() || (channel.readOnly && !manager)}>
          <SendHorizontal aria-hidden="true" className="size-4" />
        </button>
      </form>
    </section>
  );
}
