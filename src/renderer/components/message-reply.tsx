import type { ChatReply } from '../../shared/community';
import { readableMentions } from '../../shared/mentions';
import { Avatar } from './avatar';

/**
 * The message an answer is about, quoted above it on one line and joined to
 * the answer's picture by a curved hairline. A click goes back to it.
 */
export function MessageReply({
  reply,
  people,
  avatarId,
  onReveal,
}: {
  /** Null once the answered message was deleted. */
  reply: ChatReply | null;
  people: ReadonlyMap<string, string>;
  avatarId?: string | null;
  onReveal(messageId: string): void;
}) {
  if (!reply)
    return (
      <div className="message-reply is-gone">
        <span className="message-reply-spine" aria-hidden="true" />
        <span className="message-reply-text">The original message was deleted</span>
      </div>
    );
  const text = reply.content.trim()
    ? readableMentions(reply.content, (id) => people.get(id)).replace(/\s+/g, ' ')
    : reply.attachments
      ? 'Sent a file'
      : '';
  return (
    <button
      type="button"
      className="message-reply"
      aria-label={`Replying to ${reply.authorName}: ${text}. Go to the message`}
      onClick={() => onReveal(reply.id)}
    >
      <span className="message-reply-spine" aria-hidden="true" />
      <Avatar className="message-reply-avatar" name={reply.authorName} imageId={avatarId} />
      <strong className="message-reply-author">{reply.authorName}</strong>
      <span className="message-reply-text">{text}</span>
    </button>
  );
}
