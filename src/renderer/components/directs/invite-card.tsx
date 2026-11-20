import { useState } from 'react';
import { motion } from 'motion/react';
import { ArrowRight, Check, Clock3, LoaderCircle, Users, X } from 'lucide-react';
import type { DirectInvite } from '../../../shared/community';
import type { CommunityClient } from '../../infrastructure/community-client';
import { initialsOf } from '../../domain/roster';
import { Avatar } from '../avatar';
import { cn } from '../ui/utils';

const statusWording: Record<DirectInvite['status'], string> = {
  pending: 'Waiting for an answer',
  accepted: 'Joined',
  declined: 'Declined',
  revoked: 'Withdrawn',
  expired: 'Expired',
};

const daysLeft = (expiresAt: string) =>
  Math.max(1, Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 86_400_000));

/**
 * An invitation to a server, carried by a message. The person invited answers
 * it here; the person who sent it sees how it went and can take it back.
 */
export function InviteCard({
  api,
  invite,
  userId,
  inviterName,
  joined,
  onJoined,
  onChanged,
}: {
  api: CommunityClient;
  invite?: DirectInvite;
  userId: string;
  inviterName: string;
  /** Whether this account is already a member, whatever the card says. */
  joined: boolean;
  onJoined(serverId: string): void;
  onChanged(): void;
}) {
  const [busy, setBusy] = useState<'accept' | 'decline' | 'revoke'>();
  const [error, setError] = useState('');

  if (!invite) {
    return (
      <div className="invite-card is-gone">
        <p>This server no longer exists.</p>
      </div>
    );
  }

  const mine = invite.inviterId === userId;
  const forMe = invite.inviteeId === userId;
  const waiting = invite.status === 'pending';
  const act = async (action: 'accept' | 'decline' | 'revoke') => {
    setBusy(action);
    setError('');
    try {
      const result = await api.request<{ serverId?: string }>(
        `/api/direct-invites/${invite.id}/${action}`,
        'POST',
      );
      if (action === 'accept') onJoined(result.serverId ?? invite.serverId);
      else onChanged();
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : 'That did not work. Try again.');
      onChanged();
    } finally {
      setBusy(undefined);
    }
  };

  return (
    <motion.div
      className={cn('invite-card', `is-${invite.status}`)}
      initial={{ opacity: 0, y: 10, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
    >
      <span className="invite-card-kicker">
        {forMe ? `${inviterName} invited you to a server` : 'You sent an invitation'}
      </span>
      <div className="invite-card-body">
        <Avatar
          className="invite-card-icon"
          name={invite.serverName}
          initials={initialsOf(invite.serverName)}
          imageId={invite.serverIconId}
        />
        <div className="invite-card-copy">
          <strong title={invite.serverName}>{invite.serverName}</strong>
          <small>
            <Users size={12} aria-hidden="true" />
            {invite.memberCount} {invite.memberCount === 1 ? 'member' : 'members'}
            {waiting && (
              <>
                <span aria-hidden="true">·</span>
                <Clock3 size={12} aria-hidden="true" />
                {daysLeft(invite.expiresAt)}d left
              </>
            )}
          </small>
        </div>
      </div>

      <div className="invite-card-actions">
        {forMe && waiting && !joined ? (
          <>
            <button
              type="button"
              className="invite-join"
              disabled={Boolean(busy)}
              onClick={() => void act('accept')}
            >
              {busy === 'accept' ? (
                <LoaderCircle size={15} className="animate-spin" aria-hidden="true" />
              ) : (
                <ArrowRight size={15} aria-hidden="true" />
              )}
              Join server
            </button>
            <button
              type="button"
              className="invite-decline"
              disabled={Boolean(busy)}
              onClick={() => void act('decline')}
            >
              Decline
            </button>
          </>
        ) : forMe && joined ? (
          <button type="button" className="invite-join is-open" onClick={() => onJoined(invite.serverId)}>
            <ArrowRight size={15} aria-hidden="true" />
            Open server
          </button>
        ) : (
          <span className={cn('invite-status', `is-${invite.status}`)}>
            {invite.status === 'accepted' ? (
              <Check size={13} aria-hidden="true" />
            ) : waiting ? (
              <i aria-hidden="true" />
            ) : (
              <X size={13} aria-hidden="true" />
            )}
            {statusWording[invite.status]}
          </span>
        )}
        {mine && waiting && (
          <button
            type="button"
            className="invite-withdraw"
            disabled={Boolean(busy)}
            onClick={() => void act('revoke')}
          >
            Withdraw
          </button>
        )}
      </div>
      {error && (
        <p role="alert" className="invite-card-error">
          {error}
        </p>
      )}
    </motion.div>
  );
}
