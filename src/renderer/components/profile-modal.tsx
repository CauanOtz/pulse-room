import * as Primitive from '@radix-ui/react-dialog';
import type { ReactNode } from 'react';
import { CalendarDays, Crown, Mic, Pencil, Radio, Volume2, VolumeX, X } from 'lucide-react';
import type { CommunityDetail, CommunityMember } from '../../shared/community';
import { rolesOf } from '../domain/access';
import type { CommunityClient } from '../infrastructure/community-client';
import { Avatar } from './avatar';
import { MemberActionsSection, type VoiceSeat } from './member-actions';
import { ProfileBanner, TagChip, themedCard } from './profile-identity';
import { cn } from './ui/utils';

const day = (value?: string | null) =>
  value ? new Date(value).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : undefined;

/** How one other person sounds to you, when they are in your call. */
export interface ProfileAudio {
  volume: number;
  locallyMuted: boolean;
  onVolume(volume: number): void;
  onMuted(muted: boolean): void;
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <h3 className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">{title}</h3>
      {children}
    </section>
  );
}

/**
 * Somebody's whole profile, in the middle of the window: their banner and
 * colours across the top, their face large, and under it everything the room
 * knows about them and everything you may do about them.
 *
 * It is the place a small card leads to, the way a person's page is reached
 * from their name, and it is drawn in their own colours so it reads as theirs.
 */
export function ProfileModal({
  api,
  detail,
  userId,
  member,
  seat,
  audio,
  seatOf,
  onEditProfile,
  onChanged,
  onClose,
}: {
  api: CommunityClient;
  detail: CommunityDetail;
  userId: string;
  member: CommunityMember;
  /** The call they are sitting in, if any. */
  seat?: VoiceSeat;
  /** Present when they are in your call, where their volume is yours to set. */
  audio?: ProfileAudio;
  seatOf?(accountId: string): VoiceSeat | undefined;
  onEditProfile?(): void;
  onChanged(): Promise<void>;
  onClose(): void;
}) {
  const isYou = member.id === userId;
  const roles = rolesOf(detail, member);
  const timedOut = Boolean(member.timeoutUntil && new Date(member.timeoutUntil) > new Date());

  return (
    <Primitive.Root open onOpenChange={(open) => !open && onClose()}>
      <Primitive.Portal>
        <Primitive.Overlay className="fixed inset-0 z-50 bg-black/70 backdrop-blur-[2px] data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <Primitive.Content
          aria-describedby={undefined}
          aria-label={`${member.displayName}'s profile`}
          className="profile-modal fixed left-1/2 top-1/2 z-50 flex max-h-[min(88vh,46rem)] w-[min(40rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border border-border bg-popover text-popover-foreground shadow-2xl outline-none data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-[0.97]"
          style={themedCard(member.theme)}
          data-themed={member.theme ? 'true' : undefined}
        >
          <Primitive.Title className="sr-only">{`${member.displayName}'s profile`}</Primitive.Title>
          <div className="relative shrink-0">
            <ProfileBanner bannerId={member.bannerId} theme={member.theme} className="h-44 w-full" />
            <Primitive.Close
              aria-label="Close profile"
              className="absolute right-3 top-3 grid size-8 place-items-center rounded-full bg-black/45 text-white backdrop-blur-sm transition-colors hover:bg-black/65 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <X className="size-4" />
            </Primitive.Close>
          </div>

          <div className="relative flex shrink-0 items-end justify-between gap-3 px-6">
            <span className="relative -mt-16">
              <Avatar
                className="grid size-30 place-items-center rounded-full border-[6px] border-[color:var(--card-surface,var(--popover))] bg-secondary text-3xl font-bold text-secondary-foreground"
                name={member.displayName}
                imageId={member.avatarId}
                animate="always"
              />
              {seat && (
                <span
                  className="absolute bottom-1.5 right-1.5 grid size-7 place-items-center rounded-full border-4 border-[color:var(--card-surface,var(--popover))] bg-success text-background"
                  aria-label="In a voice channel"
                >
                  <Mic className="size-3" strokeWidth={3} aria-hidden="true" />
                </span>
              )}
            </span>
            {isYou && onEditProfile && (
              <button
                type="button"
                className="mb-2 inline-flex h-9 items-center gap-2 rounded-md bg-primary px-3.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                onClick={onEditProfile}
              >
                <Pencil className="size-4" /> Edit profile
              </button>
            )}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4 pt-3">
            <div className="space-y-4 rounded-xl border border-border/70 bg-background/55 p-4 backdrop-blur-sm">
              <div className="min-w-0">
                <h2 className="flex min-w-0 flex-wrap items-center gap-2 text-2xl font-bold leading-tight tracking-[-0.01em]">
                  <span className="truncate">{member.displayName}</span>
                  {member.tag && <TagChip tag={member.tag} />}
                </h2>
                <p className="mt-0.5 text-sm text-muted-foreground">@{member.username}</p>
                <div className="mt-2.5 flex flex-wrap gap-1.5 text-[11px] font-medium">
                  {member.role === 'owner' && (
                    <span className="inline-flex items-center gap-1 rounded-md border border-border bg-secondary/70 px-2 py-0.5 text-foreground/85">
                      <Crown className="size-3 text-warning" /> Owner of {detail.server.name}
                    </span>
                  )}
                  {seat && (
                    <span className="inline-flex items-center gap-1 rounded-md border border-success/30 bg-success/10 px-2 py-0.5 text-success">
                      <Radio className="size-3" /> In {seat.channelName}
                    </span>
                  )}
                  {timedOut && (
                    <span className="inline-flex items-center gap-1 rounded-md border border-border bg-secondary/70 px-2 py-0.5 text-muted-foreground">
                      In a timeout until {new Date(member.timeoutUntil!).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  )}
                  {member.muted && (
                    <span className="rounded-md border border-destructive/30 bg-destructive/10 px-2 py-0.5 text-destructive">
                      Muted by the server
                    </span>
                  )}
                  {member.deafened && (
                    <span className="rounded-md border border-destructive/30 bg-destructive/10 px-2 py-0.5 text-destructive">
                      Deafened by the server
                    </span>
                  )}
                </div>
              </div>

              <div className="h-px bg-border" />

              <div className={cn('grid gap-5', !isYou && 'md:grid-cols-[minmax(0,1fr)_13rem]')}>
                <div className="min-w-0 space-y-5">
                  {member.bio?.trim() && (
                    <Section title="About me">
                      <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground/90">
                        {member.bio.trim()}
                      </p>
                    </Section>
                  )}
                  {roles.length > 0 && (
                    <Section title="Roles">
                      <ul className="flex flex-wrap gap-1.5" aria-label="Roles">
                        {roles.map((role) => (
                          <li
                            key={role.id}
                            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-secondary/60 px-2 py-1 text-xs font-medium text-foreground/90"
                          >
                            <span className="size-2 rounded-full" style={{ background: role.colour ?? 'var(--muted-foreground)' }} />
                            {role.name}
                          </li>
                        ))}
                      </ul>
                    </Section>
                  )}
                  <Section title="Member since">
                    <dl className="grid grid-cols-2 gap-3 text-sm">
                      <div className="flex items-center gap-2">
                        <CalendarDays className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                        <div className="min-w-0">
                          <dt className="text-[11px] text-muted-foreground">Pulse Room</dt>
                          <dd className="truncate">{day(member.createdAt) ?? 'Unknown'}</dd>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Avatar
                          className="grid size-4 shrink-0 place-items-center rounded bg-secondary text-[6px] font-bold"
                          name={detail.server.name}
                          imageId={detail.server.iconId}
                        />
                        <div className="min-w-0">
                          <dt className="truncate text-[11px] text-muted-foreground">{detail.server.name}</dt>
                          <dd className="truncate">{day(member.joinedAt) ?? 'Before it was kept'}</dd>
                        </div>
                      </div>
                    </dl>
                  </Section>
                  {audio && (
                    <Section title="Their volume, for you">
                      <div className="flex items-center gap-3">
                        <button
                          type="button"
                          className={cn(
                            'grid size-8 shrink-0 place-items-center rounded-md border border-border transition-colors hover:bg-accent',
                            audio.locallyMuted && 'border-destructive/40 bg-destructive/10 text-destructive',
                          )}
                          aria-label={audio.locallyMuted ? 'Unmute for me' : 'Mute for me'}
                          aria-pressed={audio.locallyMuted}
                          onClick={() => audio.onMuted(!audio.locallyMuted)}
                        >
                          {audio.locallyMuted ? <VolumeX className="size-4" /> : <Volume2 className="size-4" />}
                        </button>
                        <input
                          className="min-w-0 flex-1"
                          type="range"
                          min="0"
                          max="200"
                          aria-label={`${member.displayName} volume`}
                          value={audio.volume}
                          onChange={(event) => audio.onVolume(Number(event.target.value))}
                        />
                        <span className="w-10 text-right font-mono text-xs">{audio.volume}%</span>
                      </div>
                    </Section>
                  )}
                </div>
                {!isYou && (
                  <aside className="min-w-0 md:border-l md:border-border md:pl-4">
                    <MemberActionsSection
                      api={api}
                      detail={detail}
                      userId={userId}
                      member={member}
                      seatOf={seatOf}
                      onChanged={onChanged}
                      compact
                    />
                  </aside>
                )}
              </div>
            </div>
          </div>
        </Primitive.Content>
      </Primitive.Portal>
    </Primitive.Root>
  );
}
