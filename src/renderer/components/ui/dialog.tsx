import * as Primitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import type { ComponentProps } from 'react';
import { cn } from './utils';

export const Dialog = Primitive.Root;
export const DialogTrigger = Primitive.Trigger;
export const DialogClose = Primitive.Close;
export const DialogTitle = Primitive.Title;
export const DialogDescription = Primitive.Description;

export function DialogContent({
  className,
  children,
  ...props
}: ComponentProps<typeof Primitive.Content>) {
  return (
    <Primitive.Portal>
      <Primitive.Overlay className="fixed inset-0 z-50 bg-black/70 backdrop-blur-[2px]" />
      <Primitive.Content
        className={cn(
          'fixed left-1/2 top-1/2 z-50 flex max-h-[min(90vh,44rem)] w-[min(34rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 flex-col',
          'rounded-2xl border border-border bg-card text-card-foreground shadow-2xl outline-none',
          className,
        )}
        {...props}
      >
        {children}
      </Primitive.Content>
    </Primitive.Portal>
  );
}

export function DialogHeader({ className, ...props }: ComponentProps<'header'>) {
  return (
    <header
      className={cn('flex items-center gap-3 border-b border-border px-5 py-4', className)}
      {...props}
    />
  );
}

export function DialogBody({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('flex-1 space-y-5 overflow-y-auto px-5 py-5', className)} {...props} />;
}

export function DialogCloseButton({ label = 'Close dialog' }: { label?: string }) {
  return (
    <Primitive.Close
      className="ml-auto grid size-8 shrink-0 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      aria-label={label}
    >
      <X className="size-5" />
    </Primitive.Close>
  );
}
