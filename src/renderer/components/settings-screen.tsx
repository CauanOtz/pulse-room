import * as Primitive from '@radix-ui/react-dialog';
import { useEffect, useRef, type ReactNode } from 'react';
import { X, type LucideIcon } from 'lucide-react';
import { cn } from './ui/utils';

/**
 * Settings that fill the window, the way a place worth staying in does: the
 * sections down a rail on the left, the section itself in a readable column,
 * and the way out at the top right, by button or by Escape.
 *
 * A dialog the size of the window is still a dialog: Radix keeps the focus in
 * it, Escape closes it and whatever was behind is out of reach.
 */
export function SettingsScreen({
  title,
  label,
  nav,
  footer,
  children,
  onClose,
}: {
  /** What the rail is headed with: the server's name, or "Your account". */
  title: string;
  /** The name assistive technology reads for the whole screen. */
  label?: string;
  nav: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
  onClose(): void;
}) {
  const opener = useRef<HTMLElement | null>(null);
  useEffect(() => {
    opener.current = document.activeElement as HTMLElement | null;
    return () => opener.current?.focus?.();
  }, []);

  return (
    <Primitive.Root open onOpenChange={(open) => !open && onClose()}>
      <Primitive.Portal>
        <Primitive.Content
          aria-label={label ?? title}
          aria-describedby={undefined}
          className="settings-screen fixed inset-0 z-50 flex bg-background text-foreground outline-none data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-[0.985]"
        >
          <Primitive.Title className="sr-only">{label ?? title}</Primitive.Title>
          <aside
            className="settings-rail flex shrink-0 justify-end overflow-y-auto border-r border-border bg-sidebar"
            style={{ width: 'max(15rem, calc((100vw - 62rem) / 2 + 15rem))' }}
          >
            <div className="flex min-h-full w-60 flex-col px-3 pb-6 pt-12">
              <div className="truncate px-2.5 pb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                {title}
              </div>
              {nav}
              {footer && <div className="mt-auto border-t border-border pt-3">{footer}</div>}
            </div>
          </aside>
          <div className="modal-body settings-body min-w-0 flex-1 overflow-y-auto">
            <div className="flex min-h-full max-w-[52rem] flex-col px-10 pb-16 pt-12">{children}</div>
          </div>
          <div className="settings-close flex w-24 shrink-0 justify-center pt-12">
            <div className="flex flex-col items-center gap-1.5">
              <Primitive.Close
                aria-label="Close dialog"
                className="grid size-9 place-items-center rounded-full border-2 border-muted-foreground/45 text-muted-foreground transition-colors hover:border-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <X className="size-4.5" />
              </Primitive.Close>
              <span className="text-[11px] font-semibold text-muted-foreground" aria-hidden="true">
                ESC
              </span>
            </div>
          </div>
        </Primitive.Content>
      </Primitive.Portal>
    </Primitive.Root>
  );
}

/** One section on the rail. */
export function SettingsNavButton({
  icon: Icon,
  label,
  active,
  onClick,
  children,
  tone,
}: {
  icon: LucideIcon;
  label: string;
  active?: boolean;
  onClick(): void;
  /** Anything drawn after the label: a count, a dot for unsaved changes. */
  children?: ReactNode;
  tone?: 'danger';
}) {
  return (
    <button
      type="button"
      className={cn(
        'flex h-9 w-full items-center gap-2.5 rounded-md px-2.5 text-left text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50',
        tone === 'danger'
          ? 'text-destructive hover:bg-destructive/10'
          : active
            ? 'bg-accent text-foreground'
            : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground',
      )}
      aria-pressed={tone === 'danger' ? undefined : active}
      onClick={onClick}
    >
      <Icon className="size-4 shrink-0" aria-hidden="true" /> <span className="min-w-0 flex-1 truncate">{label}</span>
      {children}
    </button>
  );
}

/** The heading of the open section, with the sentence that says what it is for. */
export function SettingsHeading({ title, description }: { title: string; description: string }) {
  return (
    <header className="mb-6 border-b border-border pb-5">
      <h2 className="text-xl font-semibold tracking-[-0.01em] text-foreground">{title}</h2>
      <p className="mt-1.5 max-w-xl text-sm leading-6 text-muted-foreground">{description}</p>
    </header>
  );
}
