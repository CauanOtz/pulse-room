import { useEffect, useRef } from 'react';
import { Crown, Maximize2, Mic, Settings2, Shield, UserRound } from 'lucide-react';
import type { MemberRole, ProfileTheme, Role, WornTag } from '../../shared/community';
import { Avatar } from './avatar';
import { ProfileBanner, TagChip, themedCard } from './profile-identity';

export interface ProfileSummary {
  id: string;
  displayName: string;
  username?: string;
  avatarId?: string | null;
  bannerId?: string | null;
  theme?: ProfileTheme | null;
  tag?: WornTag | null;
  bio?: string;
  role?: MemberRole;
  /** Their roles in this server, highest first. */
  roles?: Role[];
  voiceChannelName?: string;
  isYou?: boolean;
}

export function ProfilePopover({
  profile,
  position,
  onAudioOptions,
  onOpenFull,
  onClose,
}: {
  profile: ProfileSummary;
  position: { x: number; y: number };
  onAudioOptions?(): void;
  /** Opens the whole profile in the middle of the window. */
  onOpenFull?(): void;
  onClose(): void;
}) {
  const cardRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);
  useEffect(() => cardRef.current?.focus(), []);

  const width = 280;
  // A banner is drawn at its own shape, two and a half times as wide as tall;
  // without one the strip stays short, as it always was.
  const bannerHeight = profile.bannerId ? width / 2.5 : 56;
  const height =
    (onAudioOptions ? 250 : 218) +
    (profile.bio?.trim() ? 80 : 0) +
    (profile.roles?.length ? 56 : 0) +
    (onOpenFull ? 44 : 0) +
    (bannerHeight - 56);
  // Open into the conversation/stage instead of covering the member list or
  // other participant tiles. Only flip to the right when the window edge makes
  // the preferred side impossible.
  const preferredLeft = position.x - width - 12;
  const left = preferredLeft >= 12
    ? preferredLeft
    : Math.min(position.x + 12, window.innerWidth - width - 12);
  const top = Math.max(12, Math.min(position.y + 8, window.innerHeight - height - 12));
  const roleLabel = profile.role === 'owner' ? 'Owner' : profile.role === 'admin' ? 'Administrator' : 'Member';

  return (
    <div className="popover-backdrop fixed inset-0 z-40" role="presentation" onMouseDown={onClose}>
      <section
        ref={cardRef}
        className="profile-popover fixed z-50 w-[280px] overflow-hidden rounded-xl border border-border bg-popover text-popover-foreground shadow-2xl"
        role="dialog"
        aria-label={`${profile.displayName} profile`}
        tabIndex={-1}
        style={{ left, top, ...themedCard(profile.theme) }}
        data-themed={profile.theme ? 'true' : undefined}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <ProfileBanner bannerId={profile.bannerId} theme={profile.theme} className="w-full" style={{ height: bannerHeight }} />
        <div className="px-4 pb-4">
          <div className="-mt-7 flex items-end justify-between gap-3">
            {onOpenFull ? (
              // The face is the way into the whole profile, as it is everywhere.
              <button
                type="button"
                className="group relative shrink-0 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label={`Open ${profile.displayName}'s full profile`}
                onClick={() => {
                  onOpenFull();
                  onClose();
                }}
              >
                <Avatar
                  className="grid size-14 place-items-center rounded-full border-[3px] border-[color:var(--card-surface,var(--popover))] bg-secondary text-sm font-bold text-secondary-foreground"
                  name={profile.displayName}
                  imageId={profile.avatarId}
                  animate="always"
                />
                <span className="absolute inset-[3px] grid place-items-center rounded-full bg-black/50 text-[9px] font-bold uppercase tracking-wide text-white opacity-0 transition-opacity group-hover:opacity-100">
                  Profile
                </span>
              </button>
            ) : (
              <Avatar
                className="grid size-14 shrink-0 place-items-center rounded-full border-[3px] border-[color:var(--card-surface,var(--popover))] bg-secondary text-sm font-bold text-secondary-foreground"
                name={profile.displayName}
                imageId={profile.avatarId}
                animate="always"
              />
            )}
            {/* Only a standing worth naming is named: "member" says nothing. */}
            {profile.role && profile.role !== 'member' && (
              <span className="mb-1 inline-flex items-center gap-1 rounded-md border border-border bg-secondary/70 px-2 py-1 text-[10px] font-medium text-muted-foreground">
                {profile.role === 'owner' ? <Crown size={12} /> : profile.role === 'admin' ? <Shield size={12} /> : <UserRound size={12} />}
                {roleLabel}
              </span>
            )}
          </div>
          <div className="mt-2 min-w-0">
            <h2 className="flex min-w-0 items-center gap-1.5 text-[15px] font-semibold leading-5">
              <span className="truncate">
                {profile.displayName}
                {profile.isYou && <span className="font-normal text-muted-foreground"> (you)</span>}
              </span>
              {profile.tag && <TagChip tag={profile.tag} />}
            </h2>
            {profile.username && <p className="truncate text-xs text-muted-foreground">@{profile.username}</p>}
          </div>
          <div className="my-3 h-px bg-border" />
          <div className="flex items-center gap-2 text-xs">
            {profile.voiceChannelName ? (
              <><span className="grid size-6 place-items-center rounded-md bg-success/10 text-success"><Mic size={13} /></span><span className="min-w-0 truncate"><span className="text-muted-foreground">In voice · </span>{profile.voiceChannelName}</span></>
            ) : (
              <><span className="size-1.5 rounded-full bg-muted-foreground/60" /><span className="text-muted-foreground">Not in a voice channel</span></>
            )}
          </div>
          {profile.bio?.trim() && (
            <p className="mt-3 whitespace-pre-wrap break-words text-xs leading-relaxed text-foreground/85">
              {profile.bio}
            </p>
          )}
          {profile.roles && profile.roles.length > 0 && (
            <div className="mt-3 space-y-1.5">
              <h3 className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">Roles</h3>
              <ul className="flex flex-wrap gap-1" aria-label="Roles">
                {profile.roles.map((role) => (
                  <li
                    key={role.id}
                    className="profile-role inline-flex items-center gap-1 rounded-md border border-border bg-secondary/60 px-1.5 py-0.5 text-[10px] font-medium text-foreground/85"
                  >
                    <span className="size-1.5 rounded-full" style={{ background: role.colour ?? 'var(--muted-foreground)' }} />
                    {role.name}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {onOpenFull && (
            <button
              className="mt-3 flex h-9 w-full items-center justify-center gap-2 rounded-md bg-primary text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              type="button"
              onClick={() => {
                onOpenFull();
                onClose();
              }}
            >
              <Maximize2 size={14} />
              View full profile
            </button>
          )}
          {onAudioOptions && (
            <button
              className="mt-3 flex h-9 w-full items-center justify-center gap-2 rounded-md border border-border bg-secondary/50 text-xs font-medium transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              type="button"
              onClick={() => { onAudioOptions(); onClose(); }}
            >
              <Settings2 size={14} />
              Audio options
            </button>
          )}
        </div>
      </section>
    </div>
  );
}
