import * as Primitive from '@radix-ui/react-tooltip';
import type { ComponentProps, ReactNode } from 'react';
import { cn } from './utils';

export const TooltipProvider = Primitive.Provider;

export function Tooltip({
  label,
  children,
  side = 'top',
}: {
  label: ReactNode;
  children: ReactNode;
  side?: ComponentProps<typeof Primitive.Content>['side'];
}) {
  return (
    <Primitive.Root>
      <Primitive.Trigger asChild>{children}</Primitive.Trigger>
      <Primitive.Portal>
        <Primitive.Content
          side={side}
          sideOffset={6}
          collisionPadding={12}
          className={cn(
            'z-50 max-w-64 rounded-md border border-border bg-popover px-2.5 py-1.5 text-xs text-popover-foreground shadow-lg',
          )}
        >
          {label}
        </Primitive.Content>
      </Primitive.Portal>
    </Primitive.Root>
  );
}
