import { motion, useReducedMotion } from 'motion/react';
import { Fragment, type ReactNode } from 'react';

/**
 * Words that arrive out of focus and settle, one after another. Screen
 * readers get the sentence whole; the pieces are only for the eye.
 */
export function BlurText({
  parts,
  label,
  delay = 0,
  stagger = 0.06,
  className,
}: {
  /** Words or fragments to reveal; an element keeps its own styling. */
  parts: ReactNode[];
  /** What the sentence says, for anything that cannot see it. */
  label: string;
  delay?: number;
  stagger?: number;
  className?: string;
}) {
  const still = useReducedMotion();
  return (
    <span className={className}>
      <span className="sr-only">{label}</span>
      {parts.map((part, index) =>
        part === '\n' ? (
          <br key={index} aria-hidden="true" />
        ) : (
          <Fragment key={index}>
            <motion.span
              aria-hidden="true"
              className="inline-block will-change-[filter,transform,opacity]"
              initial={still ? false : { opacity: 0, filter: 'blur(14px)', y: '0.35em' }}
              animate={{ opacity: 1, filter: 'blur(0px)', y: 0 }}
              transition={{ duration: 0.9, delay: delay + index * stagger, ease: [0.16, 1, 0.3, 1] }}
            >
              {part}
            </motion.span>{' '}
          </Fragment>
        ),
      )}
    </span>
  );
}
