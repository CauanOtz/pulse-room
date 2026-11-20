import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  ArrowRight,
  AtSign,
  Expand,
  LoaderCircle,
  MailPlus,
  MessageCircle,
  SendHorizontal,
} from 'lucide-react';
import type { Account, DirectConversation, DirectMessage } from '../../../shared/community';
import type { CommunityClient } from '../../infrastructure/community-client';
import { initialsOf } from '../../domain/roster';
import { Avatar } from '../avatar';
import { cn } from '../ui/utils';
import { DirectProfileModal } from './direct-profile';
import { InviteCard } from './invite-card';

const pollMs = 3_000;
const clock = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' });
const shortDay = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' });
const longDay = new Intl.DateTimeFormat(undefined, { weekday: 'long', day: 'numeric', month: 'long' });

const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();
function when(iso: string): string {
  const date = new Date(iso);
  return sameDay(date, new Date()) ? clock.format(date) : shortDay.format(date);
}
function dayLabel(iso: string): string {
  const date = new Date(iso);
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  if (sameDay(date, new Date())) return 'Today';
  if (sameDay(date, yesterday)) return 'Yesterday';
  return longDay.format(date);
}

function preview(conversation: DirectConversation, userId: string): string {
  const last = conversation.lastMessage;
  if (!last) return 'No messages yet';
  const prefix = last.authorId === userId ? 'You: ' : '';
  if (last.invite)
    return last.authorId === userId ? 'You sent a server invitation' : 'Invited you to a server';
  return `${prefix}${last.content}`;
}

/** The list of one-to-one conversations, and the way to start a new one. */
export function DirectSidebar({
  api,
  userId,
  conversations,
  selectedId,
  onSelect,
  onOpened,
  footer,
}: {
  api: CommunityClient;
  userId: string;
  conversations: DirectConversation[];
  selectedId?: string;
  onSelect(id: string): void;
  onOpened(conversation: DirectConversation): void;
  footer?: ReactNode;
}) {
  const [username, setUsername] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const unread = conversations.reduce((total, conversation) => total + conversation.unread, 0);

  const open = async (event: FormEvent) => {
    event.preventDefault();
    const name = username.trim().replace(/^@/, '');
    if (!name) return;
    setBusy(true);
    setError('');
    try {
      const result = await api.request<{ conversation: DirectConversation }>('/api/directs', 'POST', {
        username: name,
      });
      setUsername('');
      onOpened(result.conversation);
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : 'That conversation could not be opened.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <aside
      className="channel-sidebar direct-sidebar relative flex min-w-0 flex-col bg-sidebar"
      aria-label="Direct messages"
    >
      <header className="direct-head">
        <span className="direct-head-icon" aria-hidden="true">
          <MessageCircle size={16} />
        </span>
        <span className="direct-head-copy">
          <strong>Messages</strong>
          <small>{unread ? `${unread} unread` : 'Direct and private'}</small>
        </span>
      </header>

      <form className="direct-new" onSubmit={(event) => void open(event)}>
        <AtSign size={14} aria-hidden="true" />
        <input
          aria-label="Message someone by username"
          placeholder="Find by username"
          value={username}
          maxLength={33}
          autoComplete="off"
          spellCheck={false}
          onChange={(event) => {
            setUsername(event.target.value);
            setError('');
          }}
        />
        <button type="submit" aria-label="Start conversation" disabled={busy || !username.trim()}>
          {busy ? <LoaderCircle size={14} className="animate-spin" /> : <ArrowRight size={14} />}
        </button>
      </form>
      <AnimatePresence>
        {error && (
          <motion.p
            role="alert"
            className="direct-error"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
          >
            {error}
          </motion.p>
        )}
      </AnimatePresence>

      <div className="direct-list channel-scroll flex-1 overflow-y-auto">
        {conversations.length === 0 ? (
          <div className="direct-empty">
            <MailPlus size={20} aria-hidden="true" />
            <strong>No conversations yet</strong>
            <span>Type a username above. Server invitations sent to you will land here too.</span>
          </div>
        ) : (
          conversations.map((conversation, index) => {
            const selected = conversation.id === selectedId;
            return (
              <button
                key={conversation.id}
                type="button"
                className={cn(
                  'direct-row',
                  selected && 'is-selected',
                  conversation.unread > 0 && 'is-unread',
                )}
                style={{ animationDelay: `${Math.min(index, 8) * 35}ms` }}
                aria-label={conversation.peer.displayName}
                aria-current={selected || undefined}
                onClick={() => onSelect(conversation.id)}
              >
                {selected && (
                  <motion.span
                    layoutId="direct-selection"
                    className="direct-selection"
                    aria-hidden="true"
                    transition={{ type: 'spring', stiffness: 520, damping: 42 }}
                  />
                )}
                <Avatar
                  className="direct-row-avatar"
                  name={conversation.peer.displayName}
                  initials={initialsOf(conversation.peer.displayName)}
                  imageId={conversation.peer.avatarId}
                />
                <span className="direct-row-copy">
                  <strong>{conversation.peer.displayName}</strong>
                  <small>{preview(conversation, userId)}</small>
                </span>
                <span className="direct-row-meta">
                  <time dateTime={conversation.updatedAt}>{when(conversation.updatedAt)}</time>
                  {conversation.unread > 0 && (
                    <motion.b
                      key={conversation.unread}
                      className="direct-unread"
                      initial={{ scale: 0.4, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{ type: 'spring', stiffness: 600, damping: 22 }}
                      aria-label={`${conversation.unread} unread`}
                    >
                      {conversation.unread > 9 ? '9+' : conversation.unread}
                    </motion.b>
                  )}
                </span>
              </button>
            );
          })
        )}
      </div>
      {footer}
    </aside>
  );
}

/** One conversation: its history, its invitations and a line to write in. */
export function DirectPane({
  api,
  user,
  conversation,
  joinedServerIds,
  className,
  onChanged,
  onJoined,
}: {
  api: CommunityClient;
  user: Account;
  conversation?: DirectConversation;
  joinedServerIds: ReadonlySet<string>;
  className?: string;
  /** Something changed that the conversation list should know about. */
  onChanged(): void;
  onJoined(serverId: string): void;
}) {
  const [messages, setMessages] = useState<DirectMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [error, setError] = useState('');
  const history = useRef<HTMLDivElement>(null);
  const field = useRef<HTMLTextAreaElement>(null);
  const lastSeen = useRef<string | undefined>(undefined);
  const conversationId = conversation?.id;
  const changed = useRef(onChanged);
  changed.current = onChanged;

  const load = useCallback(async () => {
    if (!conversationId) return;
    const result = await api.request<{ messages: DirectMessage[] }>(
      `/api/directs/${conversationId}/messages`,
    );
    setMessages(result.messages);
    const newest = result.messages.at(-1)?.id;
    // Seen is only true while the window is actually in front of somebody.
    if (newest && newest !== lastSeen.current && document.hasFocus()) {
      lastSeen.current = newest;
      await api.request(`/api/directs/${conversationId}/read`, 'POST').catch(() => undefined);
      changed.current();
    }
  }, [api, conversationId]);

  useEffect(() => {
    setMessages([]);
    setError('');
    setProfileOpen(false);
    lastSeen.current = undefined;
    if (!conversationId) return undefined;
    void load().catch(() => undefined);
    const timer = setInterval(() => void load().catch(() => undefined), pollMs);
    field.current?.focus();
    return () => clearInterval(timer);
  }, [conversationId, load]);

  useLayoutEffect(() => {
    const element = history.current;
    if (element) element.scrollTop = element.scrollHeight;
  }, [messages.length, conversationId]);

  const send = async (event?: FormEvent) => {
    event?.preventDefault();
    const content = draft.trim();
    if (!content || !conversationId || sending) return;
    setSending(true);
    setError('');
    try {
      const result = await api.request<{ message: DirectMessage }>(
        `/api/directs/${conversationId}/messages`,
        'POST',
        { content },
      );
      setDraft('');
      setMessages((current) => [...current, result.message]);
      onChanged();
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : 'That message was not sent.');
    } finally {
      setSending(false);
      field.current?.focus();
    }
  };

  if (!conversation) {
    return (
      <main className={cn('direct-pane direct-pane-empty flex min-w-0 flex-col', className)}>
        <div className="direct-placeholder">
          <span className="direct-placeholder-mark" aria-hidden="true">
            <MessageCircle size={22} />
          </span>
          <h2>Your messages</h2>
          <p>Pick a conversation, or start one with a username. Invitations to servers arrive here.</p>
        </div>
      </main>
    );
  }

  const peer = conversation.peer;
  const nameOf = (authorId: string) => (authorId === user.id ? user.displayName : peer.displayName);

  return (
    <main className={cn('direct-pane flex min-w-0 flex-col bg-background', className)}>
      <header className="direct-pane-head">
        {/* The person at the top is the way into their profile. */}
        <button
          type="button"
          className="direct-pane-person"
          aria-label={`View ${peer.displayName}'s profile`}
          onClick={() => setProfileOpen(true)}
        >
          <span className="direct-pane-face">
            <Avatar
              className="direct-pane-avatar"
              name={peer.displayName}
              initials={initialsOf(peer.displayName)}
              imageId={peer.avatarId}
            />
            <span className="direct-pane-face-hint" aria-hidden="true">
              <Expand size={12} />
            </span>
          </span>
          <span className="direct-pane-who">
            <strong>{peer.displayName}</strong>
            <small>
              @{peer.username}
              <span className="direct-pane-open">View profile</span>
            </small>
          </span>
        </button>
      </header>
      {profileOpen && (
        <DirectProfileModal
          api={api}
          conversationId={conversation.id}
          peer={peer}
          onOpenServer={onJoined}
          onClose={() => setProfileOpen(false)}
        />
      )}

      <div ref={history} className="chat-history direct-history min-h-0 flex-1 overflow-y-auto px-5 py-4">
        <div className="chat-column mx-auto flex min-h-full w-full max-w-3xl flex-col justify-end">
          <motion.div
            className="direct-intro"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          >
            <Avatar
              className="direct-intro-avatar"
              name={peer.displayName}
              initials={initialsOf(peer.displayName)}
              imageId={peer.avatarId}
            />
            <h2>{peer.displayName}</h2>
            <p>
              This is the start of your conversation with @{peer.username}. Only the two of you can read it.
            </p>
          </motion.div>

          {messages.map((message, index) => {
            const previous = messages[index - 1];
            const newDay = !previous || !sameDay(new Date(previous.createdAt), new Date(message.createdAt));
            const continued =
              !newDay &&
              previous?.authorId === message.authorId &&
              new Date(message.createdAt).getTime() - new Date(previous.createdAt).getTime() < 5 * 60_000;
            const author = message.authorId === user.id ? user : peer;
            return (
              <div key={message.id}>
                {newDay && (
                  <div className="chat-day my-4 flex items-center gap-3" role="separator">
                    <span className="h-px flex-1 bg-border" />
                    <span className="text-[11px] font-medium text-muted-foreground">
                      {dayLabel(message.createdAt)}
                    </span>
                    <span className="h-px flex-1 bg-border" />
                  </div>
                )}
                <article className={cn('chat-message direct-message', continued && 'is-continued')}>
                  {continued ? (
                    <time className="direct-gutter-time" dateTime={message.createdAt}>
                      {clock.format(new Date(message.createdAt))}
                    </time>
                  ) : (
                    <button
                      type="button"
                      className="direct-message-face"
                      aria-label={`View ${author.displayName}'s profile`}
                      disabled={message.authorId === user.id}
                      onClick={() => setProfileOpen(true)}
                    >
                      <Avatar
                        className="direct-message-avatar"
                        name={author.displayName}
                        initials={initialsOf(author.displayName)}
                        imageId={author.avatarId}
                      />
                    </button>
                  )}
                  <div className="min-w-0 flex-1">
                    {!continued && (
                      <header className="direct-message-head">
                        <strong>{nameOf(message.authorId)}</strong>
                        <time dateTime={message.createdAt}>{clock.format(new Date(message.createdAt))}</time>
                      </header>
                    )}
                    {message.content && <p className="direct-message-text">{message.content}</p>}
                    {message.kind === 'invite' && (
                      <InviteCard
                        api={api}
                        invite={message.invite}
                        userId={user.id}
                        inviterName={nameOf(message.authorId)}
                        joined={Boolean(message.invite && joinedServerIds.has(message.invite.serverId))}
                        onJoined={onJoined}
                        onChanged={() => void load().catch(() => undefined)}
                      />
                    )}
                  </div>
                </article>
              </div>
            );
          })}
        </div>
      </div>

      {error && (
        <p role="alert" className="direct-send-error">
          {error}
        </p>
      )}
      <form
        className="chat-composer border-t border-border px-5 py-2.5"
        onSubmit={(event) => void send(event)}
      >
        <div className="composer-row mx-auto flex w-full items-center gap-3">
          <div className="composer-field flex min-w-0 flex-1 items-center">
            <textarea
              ref={field}
              aria-label="Message"
              rows={1}
              maxLength={2000}
              placeholder={`Message @${peer.username}`}
              className="min-h-10 max-h-40 w-full flex-1 resize-none border-0 bg-transparent px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault();
                  void send();
                }
              }}
            />
          </div>
          <button
            type="submit"
            className="primary-action grid size-10 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground transition-colors hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50"
            aria-label="Send"
            disabled={!draft.trim() || sending}
          >
            <SendHorizontal aria-hidden="true" className="size-4" />
          </button>
        </div>
      </form>
    </main>
  );
}
