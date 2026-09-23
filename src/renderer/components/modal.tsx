import { useEffect, useRef, type ReactNode } from 'react';
import {
  Dialog,
  DialogBody,
  DialogCloseButton,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';
import { cn } from './ui/utils';

/**
 * One dialog for the whole application. Radix owns the focus trap, the escape
 * key and the scrim; the body scrolls on its own so a long dialog never grows
 * past the window.
 */
export function Modal({
  title,
  children,
  onClose,
  contentClassName,
  headerClassName,
  bodyClassName,
}: {
  title: string;
  children: ReactNode;
  onClose(): void;
  contentClassName?: string;
  headerClassName?: string;
  bodyClassName?: string;
}) {
  // The dialog is unmounted by whoever opened it, which can outrun the focus
  // restoration inside the primitive, so the caller's focus is kept here.
  const opener = useRef<HTMLElement | null>(null);
  useEffect(() => {
    opener.current = document.activeElement as HTMLElement | null;
    return () => opener.current?.focus?.();
  }, []);

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className={cn('community-modal', contentClassName)} aria-label={title}>
        <DialogHeader className={headerClassName}>
          <DialogTitle className="min-w-0 flex-1 truncate text-lg font-semibold">{title}</DialogTitle>
          <DialogCloseButton />
        </DialogHeader>
        <DialogBody className={cn('modal-body', bodyClassName)}>{children}</DialogBody>
      </DialogContent>
    </Dialog>
  );
}
