import * as Primitive from '@radix-ui/react-hover-card';
import type { ComponentProps } from 'react';
import { cn } from './utils';

export const HoverCard = Primitive.Root;
export const HoverCardTrigger = Primitive.Trigger;

/**
 * Anchored by Radix, which keeps the card inside the window. It stays open
 * while the pointer is on it, so what it offers can be reached.
 */
export function HoverCardContent({
  className,
  sideOffset = 8,
  ...props
}: ComponentProps<typeof Primitive.Content>) {
  return (
    <Primitive.Portal>
      <Primitive.Content
        sideOffset={sideOffset}
        collisionPadding={12}
        className={cn(
          'z-50 overflow-hidden rounded-xl border border-border bg-popover p-2 text-popover-foreground shadow-xl',
          'data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
          className,
        )}
        {...props}
      />
    </Primitive.Portal>
  );
}
