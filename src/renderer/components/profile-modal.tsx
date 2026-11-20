import { CalendarDays, Crown, MessageCircle, Mic, Pencil, Radio, Volume2, VolumeX } from 'lucide-react';
import type { CommunityDetail, CommunityMember } from '../../shared/community';
import { rolesOf } from '../domain/access';
import type { CommunityClient } from '../infrastructure/community-client';
import { Avatar } from './avatar';
import { RoleMark } from './role-appearance';
import { MemberActionsSection, type VoiceSeat } from './member-actions';
import { TagChip } from './profile-identity';
import { ProfileBlock, ProfileShell } from './profile-shell';
import { cn } from './ui/utils';

const day = (value?: string | null) =>
  value
    ? new Date(value).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
    : undefined;

/** How one other person sounds to you, when they are in your call. */
export interface ProfileAudio {
  volume: number;
  locallyMuted: boolean;
  onVolume(volume: number): void;
  onMuted(muted: boolean): void;
}

/**
 * Somebody's whole profile in a server: their banner and colours across the
 * top, their face large, and under it everything the room knows about them
 * and everything you may do about them.
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
  onMessage,
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
  /** Opens a direct conversation with them. */
  onMessage?(): void;
  onChanged(): Promise<void>;
  onClose(): void;
}) {
  const isYou = member.id === userId;
  const roles = rolesOf(detail, member);
  const timedOut = Boolean(member.timeoutUntil && new Date(member.timeoutUntil) > new Date());

  return (
    <ProfileShell
      label={`${member.displayName}'s profile`}
      name={member.displayName}
      avatarId={member.avatarId}
      bannerId={member.bannerId}
      theme={member.theme}
      onClose={onClose}
      badge={
        seat && (
          <span className="profile-sheet-badge" aria-label="In a voice channel">
            <Mic className="size-3" strokeWidth={3} aria-hidden="true" />
          </span>
        )
      }
      heading={
        <>
          <span className="truncate">{member.displayName}</span>
          {member.tag && <TagChip tag={member.tag} />}
        </>
      }
      username={member.username}
      actions={
        isYou
          ? onEditProfile && (
              <button type="button" className="profile-action is-primary" onClick={onEditProfile}>
                <Pencil className="size-4" /> Edit profile
              </button>
            )
          : onMessage && (
              <button type="button" className="profile-action is-primary" onClick={onMessage}>
                <MessageCircle className="size-4" /> Message
              </button>
            )
      }
      chips={
        <>
          {member.role === 'owner' && (
            <span className="profile-chip is-owner">
              <Crown className="size-3" /> Owner of {detail.server.name}
            </span>
          )}
          {seat && (
            <span className="profile-chip is-live">
              <Radio className="size-3" /> In {seat.channelName}
            </span>
          )}
          {timedOut && (
            <span className="profile-chip">
              In a timeout until{' '}
              {new Date(member.timeoutUntil!).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
          {member.muted && <span className="profile-chip is-danger">Muted by the server</span>}
          {member.deafened && <span className="profile-chip is-danger">Deafened by the server</span>}
        </>
      }
      side={
        !isYou && (
          <MemberActionsSection
            api={api}
            detail={detail}
            userId={userId}
            member={member}
            seatOf={seatOf}
            onChanged={onChanged}
            compact
          />
        )
      }
    >
      {member.bio?.trim() && (
        <ProfileBlock title="About me">
          <p className="profile-bio">{member.bio.trim()}</p>
        </ProfileBlock>
      )}
      {roles.length > 0 && (
        <ProfileBlock title="Roles" aside={<small className="profile-block-count">{roles.length}</small>}>
          <ul className="profile-roles" aria-label="Roles">
            {roles.map((role) => (
              <li key={role.id} className="profile-role">
                <RoleMark role={role} />
                {role.name}
              </li>
            ))}
          </ul>
        </ProfileBlock>
      )}
      <ProfileBlock title="Member since">
        <dl className="profile-dates">
          <div>
            <span className="profile-date-mark" aria-hidden="true">
              <CalendarDays className="size-4" />
            </span>
            <span>
              <dt>Pulse Room</dt>
              <dd>{day(member.createdAt) ?? 'Unknown'}</dd>
            </span>
          </div>
          <div>
            <Avatar
              className="profile-date-mark is-server"
              name={detail.server.name}
              imageId={detail.server.iconId}
            />
            <span>
              <dt>{detail.server.name}</dt>
              <dd>{day(member.joinedAt) ?? 'Before it was kept'}</dd>
            </span>
          </div>
        </dl>
      </ProfileBlock>
      {audio && (
        <ProfileBlock title="Their volume, for you">
          <div className="profile-volume">
            <button
              type="button"
              className={cn('profile-volume-mute', audio.locallyMuted && 'is-muted')}
              aria-label={audio.locallyMuted ? 'Unmute for me' : 'Mute for me'}
              aria-pressed={audio.locallyMuted}
              onClick={() => audio.onMuted(!audio.locallyMuted)}
            >
              {audio.locallyMuted ? <VolumeX className="size-4" /> : <Volume2 className="size-4" />}
            </button>
            <input
              type="range"
              min="0"
              max="200"
              aria-label={`${member.displayName} volume`}
              value={audio.volume}
              style={{ ['--range-progress' as string]: `${audio.volume / 2}%` }}
              onChange={(event) => audio.onVolume(Number(event.target.value))}
            />
            <span className="profile-volume-value font-mono">{audio.volume}%</span>
          </div>
        </ProfileBlock>
      )}
    </ProfileShell>
  );
}
