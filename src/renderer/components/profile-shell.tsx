import * as Primitive from '@radix-ui/react-dialog';
import type { CSSProperties, ReactNode } from 'react';
import { X } from 'lucide-react';
import type { ProfileTheme } from '../../shared/community';
import { Avatar } from './avatar';
import { ProfileBanner } from './profile-identity';
import { useOverlayContainer } from './ui/overlay-portal';

/**
 * The colours somebody chose, as light on black: a glow behind their banner
 * and the edge of their card, rather than a tinted slab.
 */
function themeStyle(theme?: ProfileTheme | null): CSSProperties | undefined {
  if (!theme) return undefined;
  return {
    ['--profile-primary' as string]: theme.primary,
    ['--profile-accent' as string]: theme.accent,
  };
}

/** A titled block inside a profile: a label, a rule, then what it holds. */
export function ProfileBlock({
  title,
  children,
  className,
  aside,
}: {
  title: string;
  children: ReactNode;
  className?: string;
  aside?: ReactNode;
}) {
  return (
    <section className={`profile-block ${className ?? ''}`} aria-label={title}>
      <header>
        <h3>{title}</h3>
        <span aria-hidden="true" />
        {aside}
      </header>
      {children}
    </section>
  );
}

/**
 * Somebody's profile in the middle of the window. It rises out of focus while
 * the banner settles and the face springs up through it; what follows arrives
 * a beat later, part by part.
 */
export function ProfileShell({
  label,
  name,
  avatarId,
  bannerId,
  theme,
  badge,
  heading,
  username,
  chips,
  actions,
  children,
  side,
  onClose,
}: {
  label: string;
  name: string;
  avatarId?: string | null;
  bannerId?: string | null;
  theme?: ProfileTheme | null;
  /** A small mark on the face, such as being in a voice channel. */
  badge?: ReactNode;
  heading: ReactNode;
  username?: string;
  chips?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  /** A column beside the main one, such as moderation. */
  side?: ReactNode;
  onClose(): void;
}) {
  const container = useOverlayContainer();
  return (
    <Primitive.Root open onOpenChange={(open) => !open && onClose()}>
      <Primitive.Portal container={container}>
        <Primitive.Overlay className="pulse-scrim profile-scrim fixed inset-0 z-50" />
        <Primitive.Content
          aria-describedby={undefined}
          aria-label={label}
          className="profile-modal profile-sheet fixed left-1/2 top-1/2 z-50 flex max-h-[min(90vh,48rem)] w-[min(46rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden outline-none"
          style={themeStyle(theme)}
          data-themed={theme ? 'true' : undefined}
        >
          <Primitive.Title className="sr-only">{label}</Primitive.Title>
          <Primitive.Close aria-label="Close profile" className="profile-sheet-close">
            <X className="size-4" />
          </Primitive.Close>

          <div className="profile-sheet-scroll min-h-0 flex-1 overflow-y-auto">
            <div className="profile-sheet-banner">
              <ProfileBanner bannerId={bannerId} theme={theme} className="h-full w-full" />
            </div>
            <div className="profile-sheet-identity">
              <span className="profile-sheet-face">
                <Avatar className="profile-sheet-avatar" name={name} imageId={avatarId} animate="always" />
                {badge}
              </span>
              {actions && <div className="profile-sheet-actions">{actions}</div>}
            </div>
            <div className="profile-sheet-name">
              <h2>{heading}</h2>
              {username && <p>@{username}</p>}
              {chips && <div className="profile-sheet-chips">{chips}</div>}
            </div>
            <div className={side ? 'profile-sheet-body has-side' : 'profile-sheet-body'}>
              <div className="profile-sheet-main">{children}</div>
              {side && <aside className="profile-sheet-side">{side}</aside>}
            </div>
          </div>
        </Primitive.Content>
      </Primitive.Portal>
    </Primitive.Root>
  );
}
