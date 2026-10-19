import { Hash, Paperclip, SendHorizontal, Trash2 } from 'lucide-react';
import { Avatar } from './avatar';
import { TagChip } from './profile-identity';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Tooltip } from './ui/tooltip';
import { cn } from './ui/utils';
import type {
  Account,
  ChatAttachment as Attachment,
  ChatMessage,
  ChatReaction,
  CommunityChannel,
  WornTag,
} from '../../shared/community';
import type { CommunityClient } from '../infrastructure/community-client';
import { attachmentLimit, attachmentsPerMessage, attachmentTypes } from '../../shared/chat';
import { EmojiPicker } from './emoji-picker';
import { ChatAttachment } from './chat-attachment';
import { PendingAttachment } from './pending-attachment';
import { MessageContent } from './message-content';

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
  canSend,
  sendHint,
  canManageMessages,
  avatars,
  tags,
  onOpenProfile,
  onChanged,
}: {
  api: CommunityClient;
  channel: CommunityChannel;
  user: Account;
  /** Whether you may write here now; `sendHint` says why not. */
  canSend: boolean;
  sendHint?: string;
  /** Whether you may delete what other people wrote. */
  canManageMessages: boolean;
  avatars?: ReadonlyMap<string, string | null | undefined>;
  /** The server tag each author wears, drawn beside their name. */
  tags?: ReadonlyMap<string, WornTag>;
  onOpenProfile?(authorId: string, position: { x: number; y: number }): void;
  onChanged?(): void;
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
  const [loadError, setLoadError] = useState('');
  const [busy, setBusy] = useState(false);
  const [files, setFiles] = useState<{ key: string; file: File; attachment?: Attachment }[]>([]);
  const [uploadStatus, setUploadStatus] = useState('');
  const [reacting, setReacting] = useState<string>();
  const [dragging, setDragging] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const [more, setMore] = useState(true);
  const bottom = useRef<HTMLDivElement>(null);
  const historyElement = useRef<HTMLDivElement>(null);
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
          setLoadError('');
        }
      } catch (e) {
        if (!abort.signal.aborted) {
          setLoadError(e instanceof Error ? e.message : 'Chat is unavailable.');
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
  useEffect(() => {
    const element = historyElement.current;
    if (!element) return;
    const observer = new ResizeObserver(() => {
      if (scrollToEnd.current) bottom.current?.scrollIntoView({ block: 'end' });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  async function send() {
    if ((!draft.trim() && !files.length) || busy || !canSend) return;
    setBusy(true);
    setError('');
    try {
      const attachments: string[] = [];
      for (const [index, pending] of files.entries()) {
        setUploadStatus(`Uploading file ${index + 1} of ${files.length}…`);
        const attachment =
          pending.attachment ??
          (await api.upload<Attachment>(
            `/api/channels/${channel.id}/attachments?name=${encodeURIComponent(pending.file.name)}&type=${encodeURIComponent(pending.file.type || (/\.txt$/i.test(pending.file.name) ? 'text/plain' : ''))}`,
            new Blob([pending.file], { type: 'application/octet-stream' }),
          ));
        attachments.push(attachment.id);
        setFiles((current) =>
          current.map((item) => (item.key === pending.key ? { ...item, attachment } : item)),
        );
      }
      setUploadStatus('Sending message…');
      await api.request(base, 'POST', {
        content: draft.trim(),
        ...(attachments.length ? { attachmentIds: attachments } : {}),
      });
      setDraft('');
      setFiles([]);
      onChanged?.();
      const result = await api.request<{ messages: ChatMessage[] }>(base);
      setLatest(result.messages);
      scrollToEnd.current = true;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Message not sent.');
    } finally {
      setBusy(false);
      setUploadStatus('');
    }
  }

  function chooseFiles(incoming: File[]) {
    if (!canSend || busy) return;
    setError('');
    if (incoming.length + files.length > attachmentsPerMessage) {
      setError('You can attach up to 4 files to one message.');
      return;
    }
    if (incoming.some((file) => !file.size || file.size > attachmentLimit)) {
      setError('Each file must be between 1 byte and 25 MB.');
      return;
    }
    if (
      incoming.some(
        (file) =>
          !(attachmentTypes as readonly string[]).includes(file.type) &&
          !/\.(png|jpe?g|webp|gif|mp4|webm|mp3|wav|ogg|m4a|pdf|txt)$/i.test(file.name),
      )
    ) {
      setError('Choose an image, video, audio, PDF or text file.');
      return;
    }
    setFiles((current) => [...current, ...incoming.map((file) => ({ key: crypto.randomUUID(), file }))]);
  }

  function insertEmoji(emoji: string) {
    const start = textarea.current?.selectionStart ?? draft.length;
    const end = textarea.current?.selectionEnd ?? draft.length;
    const next = draft.slice(0, start) + emoji + draft.slice(end);
    if (next.length > 2000) {
      setError('Messages can have up to 2000 characters.');
      return;
    }
    setDraft(next);
    requestAnimationFrame(() => {
      textarea.current?.focus();
      textarea.current?.setSelectionRange(start + emoji.length, start + emoji.length);
    });
  }

  async function react(message: ChatMessage, emoji: string) {
    if (!canSend || reacting) return;
    setReacting(message.id);
    setError('');
    try {
      const remove = message.reactions?.some((reaction) => reaction.emoji === emoji && reaction.mine);
      const { reactions } = await api.request<{ reactions: ChatReaction[] }>(
        `${base}/${message.id}/reactions`,
        remove ? 'DELETE' : 'PUT',
        { emoji },
      );
      const update = (messages: ChatMessage[]) =>
        messages.map((item) => (item.id === message.id ? { ...item, reactions } : item));
      setLatest(update);
      setHistory(update);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Reaction could not be saved.');
    } finally {
      setReacting(undefined);
    }
  }
  return (
    <section
      className={cn('text-chat flex min-h-0 min-w-0 flex-1 flex-col', dragging && 'is-dragging')}
      aria-label={`${channel.name} chat`}
      onDragOver={(event) => {
        if (event.dataTransfer.types.includes('Files')) {
          event.preventDefault();
          if (canSend && !busy) setDragging(true);
        }
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false);
      }}
      onDrop={(event) => {
        if (event.dataTransfer.files.length) {
          event.preventDefault();
          setDragging(false);
          chooseFiles(Array.from(event.dataTransfer.files));
        }
      }}
    >
      <header className="conversation-heading">
        <span>Conversation</span>
        <span>
          <Hash size={12} aria-hidden="true" />
          {channel.name}
        </span>
      </header>
      <div
        ref={historyElement}
        className="chat-history min-h-0 flex-1 overflow-y-auto px-5 py-4"
        onScroll={(e) => {
          const el = e.currentTarget;
          scrollToEnd.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
        }}
      >
        {/* A line of text is read, not scanned, so the column stops at a width
            a sentence can be followed across. And a quiet channel hangs from
            the composer: messages at the top of an empty page read as a page
            that is missing something, rather than as a conversation that has
            only just started. */}
        <div className="chat-column mx-auto flex min-h-full w-full max-w-3xl flex-col justify-end">
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
          {!error && !loadError && messages.length === 0 && (
            <div
              className={cn(
                'chat-welcome flex flex-col items-start gap-2 px-2 pb-9',
                messages.length && 'pb-4',
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
            const mine = canManageMessages || message.authorId === user.id;
            return (
              <div key={message.id}>
                {dayBreak && (
                  // A rule with the day sitting in it, so a night of talking is
                  // read as nights rather than as one column.
                  <div className="chat-day my-4 flex items-center gap-3" role="separator">
                    <span className="h-px flex-1 bg-border" />
                    <span className="text-[11px] font-medium text-muted-foreground">{dayOf(when)}</span>
                    <span className="h-px flex-1 bg-border" />
                  </div>
                )}
                <article
                  className={cn(
                    'chat-message group/message relative flex items-start gap-3 rounded-md px-2 text-sm transition-colors hover:bg-accent/55',
                    heading ? 'mt-4 py-1.5 first:mt-0' : 'py-0.5',
                  )}
                  data-hover-scope
                >
                  {heading ? (
                    <button
                      className="mt-0.5 shrink-0 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      type="button"
                      aria-label={`View ${message.authorName}'s profile`}
                      onClick={(event) =>
                        onOpenProfile?.(message.authorId, { x: event.clientX, y: event.clientY })
                      }
                    >
                      <Avatar
                        className="profile-avatar grid size-10 place-items-center rounded-full bg-secondary text-[11px] font-bold text-secondary-foreground"
                        name={message.authorName}
                        imageId={avatars?.get(message.authorId)}
                      />
                    </button>
                  ) : (
                    // The gutter keeps its width, and only gives up the hour to
                    // somebody who reaches for it.
                    <time
                      className="mt-0.5 w-10 shrink-0 pt-px text-right text-[10px] text-muted-foreground opacity-0 transition-opacity group-hover/message:opacity-100"
                      dateTime={message.createdAt}
                    >
                      {clock.format(when)}
                    </time>
                  )}
                  <div className="min-w-0 flex-1">
                    {heading && (
                      <header className="flex flex-wrap items-baseline gap-x-2">
                        <button
                          className="text-sm font-semibold text-foreground hover:underline focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                          type="button"
                          aria-label={`View ${message.authorName}'s profile`}
                          onClick={(event) =>
                            onOpenProfile?.(message.authorId, { x: event.clientX, y: event.clientY })
                          }
                        >
                          {message.authorName}
                        </button>
                        {tags?.get(message.authorId) && (
                          <TagChip tag={tags.get(message.authorId)!} size="xs" className="self-center" />
                        )}
                        <time className="text-[11px] text-muted-foreground" dateTime={message.createdAt}>
                          {clock.format(when)}
                        </time>
                      </header>
                    )}
                    <p className="whitespace-pre-wrap break-words text-[14.5px] leading-[1.45] text-foreground/90">
                      <MessageContent content={message.content} />
                    </p>
                    {!!message.attachments?.length && (
                      <div className="message-attachments">
                        {message.attachments.map((file) => (
                          <ChatAttachment key={file.id} api={api} channelId={channel.id} file={file} />
                        ))}
                      </div>
                    )}
                    {!!message.reactions?.length && (
                      <div
                        className="message-reactions"
                        aria-label={`Reactions to message from ${message.authorName}`}
                      >
                        {message.reactions.map((reaction) => (
                          <button
                            key={reaction.emoji}
                            type="button"
                            className={cn('message-reaction', reaction.mine && 'is-mine')}
                            aria-label={`${reaction.emoji}, ${reaction.count} ${reaction.count === 1 ? 'reaction' : 'reactions'}${reaction.mine ? ', including you' : ''}`}
                            aria-pressed={reaction.mine}
                            disabled={!canSend || reacting === message.id}
                            onClick={() => void react(message, reaction.emoji)}
                          >
                            <span>{reaction.emoji}</span>
                            <small>{reaction.count}</small>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  {canSend && (
                    <div className="chat-message-actions">
                      <EmojiPicker
                        label={`React to message from ${message.authorName}`}
                        disabled={reacting === message.id}
                        onSelect={(emoji) => void react(message, emoji)}
                      />
                    </div>
                  )}
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
                              onChanged?.();
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
      </div>
      {(error || loadError) && (
        <p
          className="form-error rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive"
          role="alert"
        >
          {error || loadError}
        </p>
      )}
      <form
        // Keep the composer level with the profile controls while its field
        // floats inside the conversation.
        className="chat-composer border-t border-border px-5 py-2.5"
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
      >
        {!!files.length && (
          <div className="pending-attachments">
            {files.map((pending) => (
              <PendingAttachment
                key={pending.key}
                file={pending.file}
                busy={busy}
                onRemove={() => {
                  setFiles((current) => current.filter((item) => item.key !== pending.key));
                  if (pending.attachment)
                    void api
                      .request(`/api/channels/${channel.id}/attachments/${pending.attachment.id}`, 'DELETE')
                      .catch(() => undefined);
                }}
              />
            ))}
          </div>
        )}
        {uploadStatus && (
          <p className="upload-status" role="status">
            {uploadStatus}
          </p>
        )}
        <div className="composer-row mx-auto flex w-full items-center gap-3">
          <div className="composer-field flex min-w-0 flex-1 items-center">
            <Tooltip label="Attach files">
              <button
                className="composer-attach"
                type="button"
                aria-label="Attach files"
                disabled={!canSend || busy}
                onClick={() => fileInput.current?.click()}
              >
                <Paperclip size={19} aria-hidden="true" />
              </button>
            </Tooltip>
            <input
              ref={fileInput}
              type="file"
              className="sr-only"
              aria-label="Choose attachments"
              multiple
              accept={attachmentTypes.join(',')}
              disabled={!canSend || busy}
              onChange={(event) => {
                chooseFiles(Array.from(event.target.files ?? []));
                event.target.value = '';
              }}
            />
            <textarea
              ref={textarea}
              // Typing here is the ordinary thing to do in a channel, so the box
              // only warms a shade when it takes the keys. The caret says the rest.
              className="min-h-10 max-h-40 w-full flex-1 resize-none border-0 bg-transparent px-1 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none disabled:opacity-60"
              rows={1}
              aria-label="Message"
              placeholder={canSend ? `Message #${channel.name}` : (sendHint ?? 'This channel is read-only.')}
              disabled={!canSend || busy}
              maxLength={2000}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onPaste={(event) => {
                if (event.clipboardData.files.length) {
                  event.preventDefault();
                  chooseFiles(Array.from(event.clipboardData.files));
                }
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  void send();
                }
              }}
            />
            <EmojiPicker disabled={!canSend || busy} onSelect={insertEmoji} />
          </div>
          <button
            className="primary-action grid size-10 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground transition-colors hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50"
            aria-label="Send"
            disabled={busy || (!draft.trim() && !files.length) || !canSend}
          >
            <SendHorizontal aria-hidden="true" className="size-4" />
          </button>
        </div>
      </form>
    </section>
  );
}
