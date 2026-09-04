import * as Primitive from '@radix-ui/react-select';
import { Check, ChevronDown } from 'lucide-react';
import type { ComponentProps } from 'react';
import { cn } from './utils';

export const Select = Primitive.Root;
export const SelectValue = Primitive.Value;

export function SelectTrigger({ className, children, ...props }: ComponentProps<typeof Primitive.Trigger>) {
  return (
    <Primitive.Trigger
      className={cn(
        'flex h-9 w-full items-center justify-between gap-2 rounded-lg border border-input bg-background px-3 text-sm text-foreground',
        'transition-colors hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        'disabled:cursor-not-allowed disabled:opacity-50 [&>span]:min-w-0 [&>span]:truncate',
        className,
      )}
      {...props}
    >
      {children}
      <Primitive.Icon asChild>
        <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
      </Primitive.Icon>
    </Primitive.Trigger>
  );
}

/**
 * The list is anchored by Radix, so a machine with a dozen sound cards gets a
 * panel that stays inside the window and scrolls, rather than one that runs off
 * the bottom of the screen.
 */
export function SelectContent({ className, children, ...props }: ComponentProps<typeof Primitive.Content>) {
  return (
    <Primitive.Portal>
      <Primitive.Content
        position="popper"
        sideOffset={6}
        collisionPadding={12}
        className={cn(
          'z-50 max-h-[min(20rem,var(--radix-select-content-available-height))] w-[var(--radix-select-trigger-width)]',
          'overflow-hidden rounded-xl border border-border bg-popover text-popover-foreground shadow-xl',
          className,
        )}
        {...props}
      >
        <Primitive.Viewport className="p-1">{children}</Primitive.Viewport>
      </Primitive.Content>
    </Primitive.Portal>
  );
}

export function SelectItem({ className, children, ...props }: ComponentProps<typeof Primitive.Item>) {
  return (
    <Primitive.Item
      className={cn(
        'relative flex cursor-default select-none items-center gap-2 rounded-lg py-2 pl-2 pr-8 text-sm outline-none',
        'focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
        className,
      )}
      {...props}
    >
      <Primitive.ItemText asChild>
        <span className="min-w-0 flex-1 truncate">{children}</span>
      </Primitive.ItemText>
      <Primitive.ItemIndicator className="absolute right-2 flex size-4 items-center justify-center">
        <Check className="size-4" />
      </Primitive.ItemIndicator>
    </Primitive.Item>
  );
}
