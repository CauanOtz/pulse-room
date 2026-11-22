import { AnimatePresence, motion } from 'motion/react';
import { typingLine, type Typist } from '../infrastructure/live-context';
import { cn } from './ui/utils';

/**
 * "Ana is typing", floated over the top edge of a composer so it never moves
 * the conversation. The names carry the weight; the dots carry the motion.
 */
export function TypingLine({ typists, className }: { typists: Typist[]; className?: string }) {
  const line = typingLine(typists);
  const names = typists.length <= 2 ? typists.map((typist) => typist.name) : [];
  return (
    // A polite live region with no role, so it is never mistaken for a form's status.
    <div className={cn('typing-line', className)} aria-live="polite">
      <span className="sr-only">{line}</span>
      <AnimatePresence initial={false}>
        {line && (
          <motion.span
            key="typing"
            className="typing-line-body"
            initial={{ opacity: 0, y: 4, filter: 'blur(2px)' }}
            animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
            exit={{ opacity: 0, y: 2, filter: 'blur(2px)' }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            aria-hidden="true"
          >
            <span className="typing-dots">
              <i />
              <i />
              <i />
            </span>
            {names.length ? (
              <span>
                <strong>{names[0]}</strong>
                {names[1] && (
                  <>
                    {' and '}
                    <strong>{names[1]}</strong>
                  </>
                )}
                {names.length === 1 ? ' is typing' : ' are typing'}
              </span>
            ) : (
              <span>{line}</span>
            )}
          </motion.span>
        )}
      </AnimatePresence>
    </div>
  );
}
