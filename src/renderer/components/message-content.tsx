import { Fragment } from 'react';
import { messageLinks } from '../../shared/chat';

export function MessageContent({ content }: { content: string }) {
  const links = messageLinks(content);
  let from = 0;
  return (
    <>
      {links.map((link) => {
        const plain = content.slice(from, link.index);
        from = link.index + link.text.length;
        return (
          <Fragment key={link.index}>
            {plain}
            <a href={link.url} target="_blank" rel="noopener noreferrer">
              {link.text}
            </a>
          </Fragment>
        );
      })}
      {content.slice(from)}
    </>
  );
}
