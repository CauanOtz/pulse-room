import { useEffect, useRef } from 'react';
import { Crown, Mic, Settings2, Shield, UserRound } from 'lucide-react';
import type { MemberRole } from '../../shared/community';
import { Avatar } from './avatar';

export interface ProfileSummary {
  id: string;
  displayName: string;
  username?: string;
  avatarId?: string | null;
  bio?: string;
  role?: MemberRole;
  voiceChannelName?: string;
  isYou?: boolean;
}

export function ProfilePopover({
  profile,
  position,
  onAudioOptions,
  onClose,
}: {
  profile: ProfileSummary;
  position: { x: number; y: number };
  onAudioOptions?(): void;
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
  const height = (onAudioOptions ? 250 : 218) + (profile.bio?.trim() ? 80 : 0);
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
        style={{ left, top }}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="h-14 bg-secondary/70" />
        <div className="px-4 pb-4">
          <div className="-mt-7 flex items-end justify-between gap-3">
            <Avatar
              className="grid size-14 shrink-0 place-items-center rounded-full border-[3px] border-popover bg-secondary text-sm font-bold text-secondary-foreground"
              name={profile.displayName}
              imageId={profile.avatarId}
            />
            {profile.role && (
              <span className="mb-1 inline-flex items-center gap-1 rounded-md border border-border bg-secondary/70 px-2 py-1 text-[10px] font-medium text-muted-foreground">
                {profile.role === 'owner' ? <Crown size={12} /> : profile.role === 'admin' ? <Shield size={12} /> : <UserRound size={12} />}
                {roleLabel}
              </span>
            )}
          </div>
          <div className="mt-2 min-w-0">
            <h2 className="truncate text-[15px] font-semibold leading-5">
              {profile.displayName}{profile.isYou && <span className="font-normal text-muted-foreground"> (you)</span>}
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
