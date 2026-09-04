import { useEffect, useRef, type ReactNode } from 'react';
import {
  Dialog,
  DialogBody,
  DialogCloseButton,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';

/**
 * One dialog for the whole application. Radix owns the focus trap, the escape
 * key and the scrim; the body scrolls on its own so a long dialog never grows
 * past the window.
 */
export function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose(): void;
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
      <DialogContent className="community-modal" aria-label={title}>
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold">{title}</DialogTitle>
          <DialogCloseButton />
        </DialogHeader>
        <DialogBody className="modal-body">{children}</DialogBody>
      </DialogContent>
    </Dialog>
  );
}
