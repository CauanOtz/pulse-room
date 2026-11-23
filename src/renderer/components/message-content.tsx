import { Fragment, type ReactNode } from 'react';
import { messageLinks } from '../../shared/chat';
import { splitMentions } from '../../shared/mentions';
import { cn } from './ui/utils';

function withLinks(content: string, key: string): ReactNode[] {
  const links = messageLinks(content);
  let from = 0;
  const parts: ReactNode[] = links.map((link) => {
    const plain = content.slice(from, link.index);
    from = link.index + link.text.length;
    return (
      <Fragment key={`${key}:${link.index}`}>
        {plain}
        <a href={link.url} target="_blank" rel="noopener noreferrer">
          {link.text}
        </a>
      </Fragment>
    );
  });
  parts.push(<Fragment key={`${key}:end`}>{content.slice(from)}</Fragment>);
  return parts;
}

/**
 * A message as written: links made clickable, and people it names drawn as
 * `@Name`, the reader's own name lit up.
 */
export function MessageContent({
  content,
  people,
  selfId,
}: {
  content: string;
  /** Display names by account, for the people a message may name. */
  people?: ReadonlyMap<string, string>;
  selfId?: string;
}) {
  return (
    <>
      {splitMentions(content).map((part, index) =>
        'text' in part ? (
          withLinks(part.text, String(index))
        ) : (
          <span
            key={index}
            className={cn('mention', part.accountId === selfId && 'is-self')}
            data-account={part.accountId}
          >
            @{people?.get(part.accountId) ?? 'unknown'}
          </span>
        ),
      )}
    </>
  );
}
