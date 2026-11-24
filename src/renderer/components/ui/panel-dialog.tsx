import * as Primitive from '@radix-ui/react-dialog';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { X, type LucideIcon } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useOverlayContainer } from './overlay-portal';
import { Tooltip } from './tooltip';
import { cn } from './utils';

const ease = [0.16, 1, 0.3, 1] as const;

export interface PanelSection<Id extends string> {
  id: Id;
  label: string;
  icon: LucideIcon;
  /** What is in force in this section right now, read without opening it. */
  status?: ReactNode;
  /** Something here wants attention: drawn as a small light beside the status. */
  tone?: 'live' | 'attention';
}

/**
 * A settings panel: the sections down a column on the left, each saying what
 * is in force, and the open one on the right, scrolling on its own. Nothing is
 * saved until the bar that rises from the bottom is used, and the panel will
 * not close over unsaved work without saying so first.
 */
export function PanelDialog<Id extends string>({
  title,
  description,
  icon: Icon,
  sections,
  active,
  onSelect,
  dirty = false,
  saveDisabled,
  saving,
  saveLabel = 'Save changes',
  onSave,
  onReset,
  onClose,
  className,
  closeLabel = 'Close',
  children,
}: {
  closeLabel?: string;
  title: string;
  description?: string;
  icon: LucideIcon;
  sections: readonly PanelSection<Id>[];
  active: Id;
  onSelect(id: Id): void;
  dirty?: boolean;
  saveDisabled?: boolean;
  saving?: boolean;
  saveLabel?: string;
  onSave?(): void;
  onReset?(): void;
  onClose(): void;
  className?: string;
  children: ReactNode;
}) {
  const container = useOverlayContainer();
  const reduced = useReducedMotion();
  const body = useRef<HTMLDivElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  // Closing over unsaved work nudges the bar once instead of throwing it away.
  const [nudge, setNudge] = useState(0);
  useEffect(() => {
    opener.current = document.activeElement as HTMLElement | null;
    return () => opener.current?.focus?.();
  }, []);
  useEffect(() => {
    // scrollTo answers with a promise in current Chromium; an effect must not return it.
    void body.current?.scrollTo({ top: 0 });
  }, [active]);

  const requestClose = () => {
    if (dirty) setNudge((count) => count + 1);
    else onClose();
  };
  const move = (step: number) => {
    const index = sections.findIndex((section) => section.id === active);
    const next = sections[(index + step + sections.length) % sections.length]!;
    onSelect(next.id);
    document.getElementById(`panel-tab-${next.id}`)?.focus();
  };

  return (
    <Primitive.Root open onOpenChange={(open) => !open && requestClose()}>
      <Primitive.Portal container={container}>
        <Primitive.Overlay className="panel-scrim" />
        <Primitive.Content
          className={cn('panel-dialog community-modal', className)}
          aria-describedby={description ? 'panel-description' : undefined}
          onEscapeKeyDown={(event) => {
            // A select or a menu inside closes first; the panel only on its own Escape.
            if (event.defaultPrevented) return;
            if (dirty) {
              event.preventDefault();
              setNudge((count) => count + 1);
            }
          }}
          onPointerDownOutside={(event) => {
            if (dirty) {
              event.preventDefault();
              setNudge((count) => count + 1);
            }
          }}
        >
          <aside className="panel-rail">
            <header className="panel-identity">
              <span className="panel-identity-mark" aria-hidden="true">
                <Icon size={17} strokeWidth={1.9} />
              </span>
              <div className="min-w-0">
                <Primitive.Title asChild>
                  <h2>{title}</h2>
                </Primitive.Title>
                {description && (
                  <Primitive.Description asChild>
                    <p id="panel-description">{description}</p>
                  </Primitive.Description>
                )}
              </div>
            </header>
            <nav
              className="panel-sections"
              role="tablist"
              aria-orientation="vertical"
              aria-label={`${title} sections`}
              onKeyDown={(event) => {
                if (event.key === 'ArrowDown') {
                  event.preventDefault();
                  move(1);
                }
                if (event.key === 'ArrowUp') {
                  event.preventDefault();
                  move(-1);
                }
              }}
            >
              {sections.map((section) => {
                const selected = section.id === active;
                const SectionIcon = section.icon;
                return (
                  <button
                    key={section.id}
                    id={`panel-tab-${section.id}`}
                    type="button"
                    role="tab"
                    aria-label={section.label}
                    aria-selected={selected}
                    aria-controls={`panel-section-${section.id}`}
                    tabIndex={selected ? 0 : -1}
                    className={cn('panel-tab', selected && 'is-selected')}
                    onClick={() => onSelect(section.id)}
                  >
                    {selected && (
                      <motion.span
                        layoutId={`${title}-panel-thumb`}
                        className="panel-tab-thumb"
                        aria-hidden="true"
                        transition={
                          reduced ? { duration: 0 } : { type: 'spring', stiffness: 520, damping: 42 }
                        }
                      />
                    )}
                    <SectionIcon className="panel-tab-icon" size={16} strokeWidth={1.9} aria-hidden="true" />
                    <span className="panel-tab-text">
                      <span className="panel-tab-label">{section.label}</span>
                      {section.status && (
                        <span className="panel-tab-status">
                          {section.tone && (
                            <i className={`panel-tab-light is-${section.tone}`} aria-hidden="true" />
                          )}
                          {section.status}
                        </span>
                      )}
                    </span>
                  </button>
                );
              })}
            </nav>
          </aside>

          <div className="panel-main">
            <Tooltip label="Close" shortcut="Esc" side="left">
              <button type="button" className="panel-close" aria-label={closeLabel} onClick={requestClose}>
                <X size={17} />
              </button>
            </Tooltip>
            <div ref={body} className="panel-body modal-body">
              <AnimatePresence mode="wait" initial={false}>
                <motion.div
                  key={active}
                  id={`panel-section-${active}`}
                  role="tabpanel"
                  aria-labelledby={`panel-tab-${active}`}
                  className="panel-section"
                  initial={reduced ? false : { opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={reduced ? undefined : { opacity: 0, y: -4, transition: { duration: 0.12 } }}
                  transition={{ duration: 0.28, ease }}
                >
                  {children}
                </motion.div>
              </AnimatePresence>
            </div>
            <AnimatePresence>
              {dirty && onSave && (
                <motion.div
                  key="save-bar"
                  className="panel-save-bar"
                  role="region"
                  aria-label="Unsaved changes"
                  initial={reduced ? { opacity: 0 } : { opacity: 0, y: 24, scale: 0.97 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={
                    reduced
                      ? { opacity: 0 }
                      : { opacity: 0, y: 16, scale: 0.98, transition: { duration: 0.18 } }
                  }
                  transition={{ type: 'spring', stiffness: 460, damping: 34 }}
                >
                  <motion.div
                    key={nudge}
                    className={cn('panel-save-inner', nudge > 0 && 'is-nudged')}
                    animate={nudge > 0 && !reduced ? { x: [0, -8, 7, -5, 3, 0] } : undefined}
                    transition={{ duration: 0.42 }}
                  >
                    <span className="panel-save-text">
                      <i aria-hidden="true" />
                      {nudge > 0 ? 'Save or reset your changes before leaving' : 'You have unsaved changes'}
                    </span>
                    {onReset && (
                      <button type="button" className="panel-reset" onClick={onReset} disabled={saving}>
                        Reset
                      </button>
                    )}
                    <button
                      type="button"
                      className="panel-save"
                      onClick={onSave}
                      disabled={saveDisabled || saving}
                    >
                      {saving ? 'Saving…' : saveLabel}
                    </button>
                  </motion.div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </Primitive.Content>
      </Primitive.Portal>
    </Primitive.Root>
  );
}

/** The heading of the open section: big, plain, with the sentence that says what it is for. */
export function PanelHeading({
  title,
  description,
  aside,
}: {
  title: string;
  description?: string;
  aside?: ReactNode;
}) {
  return (
    <header className="panel-heading">
      <div className="min-w-0">
        <h3>{title}</h3>
        {description && <p>{description}</p>}
      </div>
      {aside}
    </header>
  );
}

/** A run of related settings under a quiet caption, one hairline between each. */
export function PanelGroup({
  title,
  children,
  className,
}: {
  title?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn('panel-group', className)}>
      {title && <h4 className="panel-group-title">{title}</h4>}
      <div className="panel-group-rows">{children}</div>
    </section>
  );
}

/**
 * One setting: what it is and what it does on the left, its control on the
 * right. Wide controls (a list, a slider, a field) sit underneath instead.
 */
export function PanelRow({
  label,
  detail,
  control,
  htmlFor,
  stacked,
  value,
  children,
}: {
  label: ReactNode;
  detail?: ReactNode;
  control?: ReactNode;
  htmlFor?: string;
  stacked?: boolean;
  /** A reading drawn beside the label, in mono: a percentage, a version. */
  value?: ReactNode;
  children?: ReactNode;
}) {
  const Label = htmlFor ? 'label' : 'span';
  return (
    <div className={cn('panel-row', stacked && 'is-stacked')}>
      <div className="panel-row-text">
        <Label className="panel-row-label" {...(htmlFor ? { htmlFor } : {})}>
          {label}
          {value !== undefined && <output className="panel-row-value">{value}</output>}
        </Label>
        {detail && <p className="panel-row-detail">{detail}</p>}
      </div>
      {control && <div className="panel-row-control">{control}</div>}
      {children && <div className="panel-row-wide">{children}</div>}
    </div>
  );
}
