import * as Primitive from '@radix-ui/react-tooltip';
import type { ReactNode } from 'react';
import { cn } from './ui/utils';

/**
 * The filter that makes two shapes read as one drop of liquid. It is declared
 * once and applied to a label the size of a stamp, and nothing about it
 * animates: only the blob beneath it moves, on the compositor.
 */
export function GooeyFilter() {
  return (
    <svg className="pointer-events-none absolute size-0" aria-hidden="true" focusable="false">
      <filter id="pulse-gooey">
        <feGaussianBlur in="SourceGraphic" stdDeviation="4" result="blur" />
        <feColorMatrix
          in="blur"
          mode="matrix"
          values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 20 -9"
          result="gooey"
        />
        <feBlend in="SourceGraphic" in2="gooey" />
      </filter>
    </svg>
  );
}

export type StatusTone = 'live' | 'idle' | 'away';

const tones: Record<StatusTone, string> = {
  live: 'bg-success',
  idle: 'bg-muted-foreground',
  away: 'bg-destructive',
};

/**
 * A hint that states a condition rather than naming a control: the dot leaves
 * the person and settles into the label, so the two read as one thing.
 */
export function StatusTooltip({
  label,
  tone = 'idle',
  side = 'top',
  children,
}: {
  label: ReactNode;
  tone?: StatusTone;
  side?: 'top' | 'right' | 'bottom' | 'left';
  children: ReactNode;
}) {
  return (
    <Primitive.Root>
      <Primitive.Trigger asChild>{children}</Primitive.Trigger>
      <Primitive.Portal>
        <Primitive.Content
          side={side}
          sideOffset={10}
          collisionPadding={12}
          className="gooey-tooltip z-50 will-change-[transform,opacity]"
        >
          <span className="relative flex items-center" style={{ filter: 'url(#pulse-gooey)' }}>
            <span className={cn('gooey-blob absolute left-3 size-3 rounded-full', tones[tone])} />
            <span
              className={cn(
                'relative flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold',
                'bg-popover text-popover-foreground',
              )}
            >
              <span className={cn('size-2 rounded-full', tones[tone])} />
              {label}
            </span>
          </span>
        </Primitive.Content>
      </Primitive.Portal>
    </Primitive.Root>
  );
}
