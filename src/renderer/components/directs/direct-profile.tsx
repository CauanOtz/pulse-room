import { useEffect, useState } from 'react';
import { ArrowUpRight, CalendarDays } from 'lucide-react';
import type { DirectPeer, DirectProfile } from '../../../shared/community';
import type { CommunityClient } from '../../infrastructure/community-client';
import { initialsOf } from '../../domain/roster';
import { Avatar } from '../avatar';
import { TagChip } from '../profile-identity';
import { ProfileBlock, ProfileShell } from '../profile-shell';

const day = (value?: string | null) =>
  value
    ? new Date(value).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
    : undefined;

/**
 * The person on the other side of a conversation. They may share no server
 * with you, so this asks the conversation for them rather than a server.
 */
export function DirectProfileModal({
  api,
  conversationId,
  peer,
  onOpenServer,
  onClose,
}: {
  api: CommunityClient;
  conversationId: string;
  /** What the conversation list already knows, shown while the rest loads. */
  peer: DirectPeer;
  onOpenServer(serverId: string): void;
  onClose(): void;
}) {
  const [profile, setProfile] = useState<DirectProfile>();
  const [error, setError] = useState('');

  useEffect(() => {
    let current = true;
    api
      .request<DirectProfile>(`/api/directs/${conversationId}/profile`)
      .then((result) => current && setProfile(result))
      .catch(
        (problem) => current && setError(problem instanceof Error ? problem.message : 'Profile unavailable.'),
      );
    return () => {
      current = false;
    };
  }, [api, conversationId]);

  const account = profile?.account;
  const name = account?.displayName ?? peer.displayName;

  return (
    <ProfileShell
      label={`${name}'s profile`}
      name={name}
      avatarId={account?.avatarId ?? peer.avatarId}
      bannerId={account?.bannerId}
      theme={account?.theme}
      heading={
        <>
          <span className="truncate">{name}</span>
          {account?.tag && <TagChip tag={account.tag} />}
        </>
      }
      username={account?.username ?? peer.username}
      onClose={onClose}
    >
      {!profile && !error && (
        <div className="profile-loading" aria-label="Loading profile">
          <span />
          <span />
          <span />
        </div>
      )}
      {error && (
        <p role="alert" className="profile-error">
          {error}
        </p>
      )}
      {account?.bio?.trim() && (
        <ProfileBlock title="About me">
          <p className="profile-bio">{account.bio.trim()}</p>
        </ProfileBlock>
      )}
      {profile && (
        <ProfileBlock
          title="Servers in common"
          aside={<small className="profile-block-count">{profile.mutualServers.length}</small>}
        >
          {profile.mutualServers.length ? (
            <ul className="profile-servers">
              {profile.mutualServers.map((server) => (
                <li key={server.id}>
                  <button
                    type="button"
                    className="profile-server"
                    onClick={() => {
                      onClose();
                      onOpenServer(server.id);
                    }}
                  >
                    <Avatar
                      className="profile-server-icon"
                      name={server.name}
                      initials={initialsOf(server.name)}
                      imageId={server.iconId}
                    />
                    <span>{server.name}</span>
                    <ArrowUpRight className="profile-server-go" size={14} aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="profile-muted">You do not share a server yet.</p>
          )}
        </ProfileBlock>
      )}
      {account && (
        <ProfileBlock title="Member since">
          <dl className="profile-dates">
            <div>
              <span className="profile-date-mark" aria-hidden="true">
                <CalendarDays className="size-4" />
              </span>
              <span>
                <dt>Pulse Room</dt>
                <dd>{day(account.createdAt) ?? 'Unknown'}</dd>
              </span>
            </div>
          </dl>
        </ProfileBlock>
      )}
    </ProfileShell>
  );
}
