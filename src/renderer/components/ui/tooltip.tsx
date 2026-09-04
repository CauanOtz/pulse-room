import * as Primitive from '@radix-ui/react-tooltip';
import type { ComponentProps, ReactNode } from 'react';
import { cn } from './utils';

export const TooltipProvider = Primitive.Provider;

interface TooltipProps {
  label: ReactNode;
  children: ReactNode;
  side?: ComponentProps<typeof Primitive.Content>['side'];
  shortcut?: string;
  className?: string;
}

/**
 * A hint that arrives and leaves on its own.
 *
 * The animation moves opacity and transform only, which the compositor can do
 * without repainting: this window sits over a game and a live screen, so an
 * effect that costs frames is not worth a label.
 */
export function Tooltip({ label, children, side = 'top', shortcut, className }: TooltipProps) {
  return (
    <Primitive.Root>
      <Primitive.Trigger asChild>{children}</Primitive.Trigger>
      <Primitive.Portal>
        <Primitive.Content
          side={side}
          sideOffset={8}
          collisionPadding={12}
          className={cn(
            'pulse-tooltip z-50 flex max-w-64 items-center gap-2 rounded-lg border border-border bg-popover px-2.5 py-1.5',
            'text-xs font-medium text-popover-foreground shadow-lg will-change-[transform,opacity]',
            className,
          )}
        >
          {label}
          {shortcut && (
            <kbd className="rounded border border-border bg-secondary px-1.5 py-0.5 font-sans text-[10px] text-muted-foreground">
              {shortcut}
            </kbd>
          )}
          <Primitive.Arrow className="fill-popover" width={10} height={5} />
        </Primitive.Content>
      </Primitive.Portal>
    </Primitive.Root>
  );
}
