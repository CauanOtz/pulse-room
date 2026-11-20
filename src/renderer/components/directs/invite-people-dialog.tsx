import { useState, type FormEvent } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowRight, AtSign, Check, KeyRound, LoaderCircle, Send } from 'lucide-react';
import type { DirectConversation, DirectMessage } from '../../../shared/community';
import type { CommunityClient } from '../../infrastructure/community-client';
import { initialsOf } from '../../domain/roster';
import { Avatar } from '../avatar';
import { Modal } from '../modal';

/**
 * Invites somebody to the server by sending it to them as a message, instead
 * of handing out a code to paste. People already written to are one click.
 */
export function InvitePeopleDialog({
  api,
  serverId,
  serverName,
  memberIds,
  conversations,
  onOpenConversation,
  onUseCodes,
  onSent,
  onClose,
}: {
  api: CommunityClient;
  serverId: string;
  serverName: string;
  memberIds: ReadonlySet<string>;
  conversations: DirectConversation[];
  onOpenConversation(conversationId: string): void;
  /** Opens the server's code invitations, for people who prefer them. */
  onUseCodes?(): void;
  onSent(): void;
  onClose(): void;
}) {
  const [username, setUsername] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState<{ name: string; conversationId: string }>();
  const suggestions = conversations
    .map((conversation) => conversation.peer)
    .filter((peer) => !memberIds.has(peer.id))
    .slice(0, 6);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const name = username.trim().replace(/^@/, '');
    if (!name) return;
    setBusy(true);
    setError('');
    try {
      const result = await api.request<{ conversationId: string; message: DirectMessage }>(
        `/api/servers/${serverId}/invites/direct`,
        'POST',
        { username: name, ...(note.trim() ? { note: note.trim() } : {}) },
      );
      setSent({ name, conversationId: result.conversationId });
      setUsername('');
      setNote('');
      onSent();
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : 'The invitation was not sent.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={`Invite people to ${serverName}`} onClose={onClose} contentClassName="invite-people-dialog">
      <AnimatePresence mode="wait" initial={false}>
        {sent ? (
          <motion.div
            key="sent"
            className="invite-sent"
            initial={{ opacity: 0, scale: 0.96, filter: 'blur(6px)' }}
            animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
            exit={{ opacity: 0, scale: 0.98 }}
            transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
          >
            <motion.span
              className="invite-sent-check"
              initial={{ scale: 0.2, rotate: -45 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ type: 'spring', stiffness: 420, damping: 18, delay: 0.08 }}
            >
              <Check size={22} strokeWidth={3} />
            </motion.span>
            <h3>Invitation sent to @{sent.name}</h3>
            <p>It is waiting in your conversation with them. It stays open for seven days.</p>
            <div className="invite-sent-actions">
              <button type="button" className="invite-secondary" onClick={() => setSent(undefined)}>
                Invite someone else
              </button>
              <button
                type="button"
                className="invite-primary"
                onClick={() => onOpenConversation(sent.conversationId)}
              >
                Open conversation <ArrowRight size={14} />
              </button>
            </div>
          </motion.div>
        ) : (
          <motion.form
            key="form"
            className="invite-form"
            onSubmit={(event) => void submit(event)}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
          >
            <p className="invite-lede">
              They get it as a direct message and join with one click. No codes to copy.
            </p>
            <label className="invite-field">
              <span>Username</span>
              <span className="invite-input">
                <AtSign size={14} aria-hidden="true" />
                <input
                  autoFocus
                  aria-label="Username"
                  placeholder="their_username"
                  autoComplete="off"
                  spellCheck={false}
                  maxLength={33}
                  value={username}
                  onChange={(event) => {
                    setUsername(event.target.value);
                    setError('');
                  }}
                />
              </span>
            </label>
            {suggestions.length > 0 && (
              <div className="invite-suggestions" aria-label="People you message">
                {suggestions.map((peer) => (
                  <button
                    key={peer.id}
                    type="button"
                    className={username === peer.username ? 'is-picked' : undefined}
                    onClick={() => setUsername(peer.username)}
                  >
                    <Avatar
                      className="invite-suggestion-avatar"
                      name={peer.displayName}
                      initials={initialsOf(peer.displayName)}
                      imageId={peer.avatarId}
                    />
                    {peer.displayName}
                  </button>
                ))}
              </div>
            )}
            <label className="invite-field">
              <span>A note (optional)</span>
              <textarea
                aria-label="Note"
                rows={2}
                maxLength={500}
                placeholder="Come hang out tonight"
                value={note}
                onChange={(event) => setNote(event.target.value)}
              />
            </label>
            {error && (
              <p role="alert" className="invite-error">
                {error}
              </p>
            )}
            <div className="invite-form-actions">
              {onUseCodes && (
                <button type="button" className="invite-codes" onClick={onUseCodes}>
                  <KeyRound size={13} /> Use an invite code instead
                </button>
              )}
              <button type="submit" className="invite-primary" disabled={busy || !username.trim()}>
                {busy ? <LoaderCircle size={14} className="animate-spin" /> : <Send size={14} />}
                Send invitation
              </button>
            </div>
          </motion.form>
        )}
      </AnimatePresence>
    </Modal>
  );
}
