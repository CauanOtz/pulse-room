import { Pencil } from 'lucide-react';
import type { Account } from '../../shared/community';
import { AppearanceChoice } from './appearance-choice';
import { Avatar } from './avatar';
import { ProfileBanner, TagChip } from './profile-identity';

interface ProfileCardProps {
  user: Account;
  onOpenAccount?(): void;
}

/**
 * Your own card, as the people in your servers see it: banner, colours, face,
 * tag and bio. The face is also the way into the account, where every part of
 * the card is changed, so the card needs no separate button for it.
 */
export function ProfileCard({ user, onOpenAccount }: ProfileCardProps) {
  const picture = (
    <Avatar
      className="grid size-16 place-items-center rounded-full border-[3px] border-[color:var(--card-surface,var(--popover))] bg-secondary text-lg font-bold text-secondary-foreground"
      name={user.displayName}
      imageId={user.avatarId}
      animate="always"
    />
  );

  return (
    <div className="profile-card flex flex-col">
      <ProfileBanner bannerId={user.bannerId} theme={user.theme} className="aspect-[5/2] w-full" />
      <div className="flex flex-col gap-3 px-4 pb-4">
        <div className="-mt-8 flex">
          {onOpenAccount ? (
            <button
              type="button"
              className="group relative rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-popover"
              aria-label="Account settings"
              title="Account settings"
              onClick={onOpenAccount}
            >
              {picture}
              <span
                className="absolute inset-[3px] grid place-items-center rounded-full bg-black/55 text-white opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
                aria-hidden="true"
              >
                <Pencil className="size-4" />
              </span>
            </button>
          ) : (
            picture
          )}
        </div>

        <div className="flex min-w-0 flex-col">
          <strong className="flex min-w-0 items-center gap-1.5 text-base font-semibold" title={user.displayName}>
            <span className="truncate">{user.displayName}</span>
            {user.tag && <TagChip tag={user.tag} size="xs" />}
          </strong>
          <span className="truncate text-xs text-muted-foreground">@{user.username}</span>
          {user.bio?.trim() && (
            <p className="mt-2 line-clamp-3 whitespace-pre-wrap break-words text-xs leading-relaxed text-foreground/85">
              {user.bio.trim()}
            </p>
          )}
        </div>

        <div className="h-px bg-border" />
        <AppearanceChoice />
      </div>
    </div>
  );
}
