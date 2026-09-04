import { Dialog, DialogBody, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import { Button } from './ui/button';

export interface Confirmation {
  title: string;
  description: string;
  /** What the button that goes through with it says: 'Remove', 'Delete'. */
  confirmLabel: string;
  /** Red for what cannot be taken back, the house colour for the rest. */
  tone?: 'danger' | 'default';
  action(): Promise<void>;
}

/**
 * The question asked before something that cannot be undone. It stands in front
 * of whatever asked it, so the answer is the only thing to give, and the escape
 * key and the scrim both mean no.
 */
export function ConfirmDialog({
  confirmation,
  busy,
  onCancel,
  onConfirm,
}: {
  confirmation: Confirmation;
  busy?: boolean;
  onCancel(): void;
  onConfirm(): void;
}) {
  return (
    <Dialog open onOpenChange={(open) => !open && onCancel()}>
      <DialogContent
        className="w-[min(26rem,calc(100vw-2rem))]"
        aria-label={confirmation.title}
        onOpenAutoFocus={(event) => event.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle className="text-base font-semibold">{confirmation.title}</DialogTitle>
        </DialogHeader>
        <DialogBody className="space-y-0 py-4">
          <p className="text-sm leading-relaxed text-muted-foreground">{confirmation.description}</p>
        </DialogBody>
        <footer className="flex justify-end gap-2 border-t border-border px-5 py-4">
          <Button variant="ghost" type="button" disabled={busy} onClick={onCancel}>
            Cancel
          </Button>
          <Button
            variant={confirmation.tone === 'danger' ? 'destructive' : 'default'}
            type="button"
            autoFocus
            disabled={busy}
            onClick={onConfirm}
          >
            {confirmation.confirmLabel}
          </Button>
        </footer>
      </DialogContent>
    </Dialog>
  );
}
