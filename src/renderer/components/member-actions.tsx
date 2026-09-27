import { useState, type ReactNode } from 'react';
import {
  ArrowRightLeft,
  Ban,
  Clock,
  Crown,
  Headphones,
  HeadphoneOff,
  Mic,
  MicOff,
  PhoneOff,
  ShieldHalf,
  UserMinus,
  type LucideIcon,
} from 'lucide-react';
import type { CommunityChannel, CommunityDetail, CommunityMember } from '../../shared/community';
import { Permission } from '../../shared/permissions';
import { canTouchRole, myAccess, outranks } from '../domain/access';
import type { CommunityClient } from '../infrastructure/community-client';
import { ConfirmDialog, type Confirmation } from './confirm-dialog';
import { Modal } from './modal';
import { cn } from './ui/utils';

const errorMessage = (error: unknown) => (error instanceof Error ? error.message : 'Something went wrong.');

/** The lengths a timeout is offered in, in minutes. */
export const timeoutChoices: { minutes: number; label: string }[] = [
  { minutes: 1, label: '1 minute' },
  { minutes: 5, label: '5 minutes' },
  { minutes: 10, label: '10 minutes' },
  { minutes: 60, label: '1 hour' },
  { minutes: 1440, label: '1 day' },
  { minutes: 10080, label: '1 week' },
];

export interface MemberAction {
  id: string;
  label: string;
  icon: LucideIcon;
  group: 'voice' | 'moderation' | 'ownership';
  tone?: 'danger';
  run(): void;
}

/** Which call somebody is sitting in, if any. */
export interface VoiceSeat {
  channelId: string;
  channelName: string;
}

/**
 * Everything that can be done to one member from wherever they are clicked:
 * the member list, their full profile, their tile in a call. The actions
 * offered are the ones the service would allow, and the choices that need one
 * more answer — which roles, how long, where to — are asked in a small dialog
 * of their own rather than in a menu off a menu, which closes when the pointer
 * takes a slightly wrong path.
 */
export function useMemberActions({
  api,
  detail,
  userId,
  onChanged,
  seatOf,
}: {
  api: CommunityClient;
  detail: CommunityDetail;
  userId: string;
  onChanged(): Promise<void>;
  /** Where each account is sitting, when the caller knows; moving needs it. */
  seatOf?(accountId: string): VoiceSeat | undefined;
}) {
  const access = myAccess(detail, userId);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [confirmation, setConfirmation] = useState<Confirmation>();
  const [acting, setActing] = useState<{ kind: 'roles' | 'timeout' | 'move'; memberId: string }>();
  const [duration, setDuration] = useState(timeoutChoices[1].minutes);
  const [destination, setDestination] = useState<string>();
  // A tick shows the moment it is made; the service's answer then replaces it,
  // or, if it refuses, the list goes back to what the service holds.
  const [pendingRoles, setPendingRoles] = useState<string[]>();
  const base = `/api/servers/${detail.server.id}`;
  const actingOn = acting && detail.members.find((member) => member.id === acting.memberId);
  const heldRoles = pendingRoles ?? actingOn?.roleIds ?? [];
  const assignable = (detail.roles ?? [])
    .filter((role) => !role.isDefault && canTouchRole(access, role))
    .sort((a, b) => b.position - a.position);
  const voiceChannels = detail.channels.filter((channel): channel is CommunityChannel => channel.type === 'voice');

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError('');
    try {
      await action();
      await onChanged();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
      setConfirmation(undefined);
    }
  }
  const moderate = (member: CommunityMember, body: object) =>
    void run(() => api.request(`${base}/members/${member.id}/moderation`, 'PATCH', body));

  function actionsFor(member: CommunityMember): MemberAction[] {
    const self = member.id === userId;
    const below = outranks(access, detail, member, userId);
    const seat = seatOf?.(member.id);
    const timedOut = Boolean(member.timeoutUntil && new Date(member.timeoutUntil) > new Date());
    const actions: MemberAction[] = [];
    const add = (condition: boolean, action: MemberAction) => condition && actions.push(action);

    add(Boolean(seat) && (below || self) && access.can(Permission.MoveMembers) && voiceChannels.length > 1, {
      id: 'move',
      label: 'Move to…',
      icon: ArrowRightLeft,
      group: 'voice',
      run: () => {
        setDestination(voiceChannels.find((channel) => channel.id !== seat?.channelId)?.id);
        setActing({ kind: 'move', memberId: member.id });
      },
    });
    add(below && access.can(Permission.MuteMembers), {
      id: 'mute',
      label: member.muted ? 'Unmute in this server' : 'Mute in this server',
      icon: member.muted ? Mic : MicOff,
      group: 'voice',
      run: () => moderate(member, { muted: !member.muted }),
    });
    add(below && access.can(Permission.DeafenMembers), {
      id: 'deafen',
      label: member.deafened ? 'Undeafen in this server' : 'Deafen in this server',
      icon: member.deafened ? Headphones : HeadphoneOff,
      group: 'voice',
      run: () => moderate(member, { deafened: !member.deafened }),
    });
    add(below && access.can(Permission.DisconnectMembers) && (seatOf ? Boolean(seat) : true), {
      id: 'disconnect',
      label: 'Disconnect from voice',
      icon: PhoneOff,
      group: 'voice',
      run: () => void run(() => api.request(`${base}/members/${member.id}/disconnect`, 'POST')),
    });
    add(access.can(Permission.ManageRoles) && (self || access.isOwner || below) && assignable.length > 0, {
      id: 'roles',
      label: 'Roles…',
      icon: ShieldHalf,
      group: 'moderation',
      run: () => setActing({ kind: 'roles', memberId: member.id }),
    });
    add(below && access.can(Permission.TimeoutMembers), {
      id: 'timeout',
      label: timedOut ? 'Remove timeout' : 'Timeout…',
      icon: Clock,
      group: 'moderation',
      run: () =>
        timedOut ? moderate(member, { timeoutMinutes: null }) : setActing({ kind: 'timeout', memberId: member.id }),
    });
    add(access.isOwner && !self, {
      id: 'transfer',
      label: 'Transfer ownership',
      icon: Crown,
      group: 'ownership',
      run: () =>
        setConfirmation({
          title: 'Transfer ownership',
          description: `Make ${member.displayName} the owner of ${detail.server.name}? You keep the roles you hold, and only they will be able to give it back.`,
          confirmLabel: 'Transfer',
          action: async () => {
            await api.request(`${base}/transfer`, 'POST', { userId: member.id });
          },
        }),
    });
    add(below && access.can(Permission.KickMembers), {
      id: 'kick',
      label: 'Kick',
      icon: UserMinus,
      group: 'ownership',
      tone: 'danger',
      run: () =>
        setConfirmation({
          title: 'Kick member',
          description: `Remove ${member.displayName} from ${detail.server.name}? They can come back with a new invitation.`,
          confirmLabel: 'Kick',
          tone: 'danger',
          action: async () => {
            await api.request(`${base}/members/${member.id}`, 'DELETE');
          },
        }),
    });
    add(below && access.can(Permission.BanMembers), {
      id: 'ban',
      label: 'Ban',
      icon: Ban,
      group: 'ownership',
      tone: 'danger',
      run: () =>
        setConfirmation({
          title: 'Ban member',
          description: `Ban ${member.displayName} from ${detail.server.name}? They are removed now and every invitation will refuse them until the ban is lifted.`,
          confirmLabel: 'Ban',
          tone: 'danger',
          action: async () => {
            await api.request(`${base}/bans`, 'POST', { userId: member.id });
          },
        }),
    });
    return actions;
  }

  const small = 'w-[min(24rem,calc(100vw-2rem))]';
  const footer = (label: string, go: () => void, disabled = false) => (
    <div className="flex justify-end gap-2">
      <button
        type="button"
        className="inline-flex h-9 items-center rounded-md px-4 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-foreground"
        onClick={() => setActing(undefined)}
      >
        Cancel
      </button>
      <button
        type="button"
        className="primary-action inline-flex h-9 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        disabled={busy || disabled}
        onClick={go}
      >
        {label}
      </button>
    </div>
  );

  const dialogs: ReactNode = (
    <>
      {acting?.kind === 'roles' && actingOn && (
        <Modal title={`Roles for ${actingOn.displayName}`} onClose={() => setActing(undefined)} contentClassName={small}>
          <div className="space-y-1" role="group" aria-label="Roles you can give">
            {assignable.map((role) => (
              <label
                key={role.id}
                className="flex cursor-pointer flex-row items-center gap-2.5 rounded-md px-2 py-2 text-sm hover:bg-accent/50"
              >
                <input
                  type="checkbox"
                  className="accent-foreground"
                  checked={heldRoles.includes(role.id)}
                  disabled={busy}
                  onChange={(event) => {
                    const roleIds = event.target.checked
                      ? [...heldRoles, role.id]
                      : heldRoles.filter((id) => id !== role.id);
                    setPendingRoles(roleIds);
                    void run(() => api.request(`${base}/members/${actingOn.id}/roles`, 'PUT', { roleIds })).finally(
                      () => setPendingRoles(undefined),
                    );
                  }}
                />
                <span className="size-2.5 rounded-full" style={{ background: role.colour ?? 'var(--muted-foreground)' }} />
                {role.name}
              </label>
            ))}
          </div>
          <p className="text-[11px] text-muted-foreground">Only roles below your own are listed. Each change is saved at once.</p>
        </Modal>
      )}
      {acting?.kind === 'timeout' && actingOn && (
        <Modal title={`Timeout ${actingOn.displayName}`} onClose={() => setActing(undefined)} contentClassName={small}>
          <p className="text-xs text-muted-foreground">
            They can still read and listen, but not write, speak or share until it ends.
          </p>
          <div className="space-y-0.5" role="radiogroup" aria-label="How long">
            {timeoutChoices.map((choice) => (
              <label
                key={choice.minutes}
                className="flex cursor-pointer flex-row items-center gap-2.5 rounded-md px-2 py-2 text-sm hover:bg-accent/50"
              >
                <input
                  type="radio"
                  name="timeout-length"
                  className="accent-foreground"
                  checked={duration === choice.minutes}
                  onChange={() => setDuration(choice.minutes)}
                />
                {choice.label}
              </label>
            ))}
          </div>
          {footer('Time out', () => {
            const target = actingOn;
            setActing(undefined);
            moderate(target, { timeoutMinutes: duration });
          })}
        </Modal>
      )}
      {acting?.kind === 'move' && actingOn && (
        <Modal title={`Move ${actingOn.displayName}`} onClose={() => setActing(undefined)} contentClassName={small}>
          <p className="text-xs text-muted-foreground">
            Their app joins the channel you choose, the way it would if they had clicked it.
          </p>
          <div className="space-y-0.5" role="radiogroup" aria-label="Voice channel">
            {voiceChannels.map((channel) => {
              const here = seatOf?.(actingOn.id)?.channelId === channel.id;
              return (
                <label
                  key={channel.id}
                  className={cn(
                    'flex cursor-pointer flex-row items-center gap-2.5 rounded-md px-2 py-2 text-sm hover:bg-accent/50',
                    here && 'cursor-default opacity-50 hover:bg-transparent',
                  )}
                >
                  <input
                    type="radio"
                    name="move-destination"
                    className="accent-foreground"
                    checked={destination === channel.id}
                    disabled={here}
                    onChange={() => setDestination(channel.id)}
                  />
                  <span className="min-w-0 flex-1 truncate">{channel.name}</span>
                  {here && <span className="text-[11px] text-muted-foreground">They are here</span>}
                </label>
              );
            })}
          </div>
          {footer(
            'Move',
            () => {
              const target = actingOn;
              setActing(undefined);
              void run(() => api.request(`${base}/members/${target.id}/move`, 'POST', { channelId: destination }));
            },
            !destination,
          )}
        </Modal>
      )}
      {confirmation && (
        <ConfirmDialog
          confirmation={confirmation}
          busy={busy}
          onCancel={() => setConfirmation(undefined)}
          onConfirm={() => void run(confirmation.action)}
        />
      )}
    </>
  );

  return { actionsFor, dialogs, busy, error };
}

/**
 * The same actions laid out as a list of buttons, for a card or a panel that
 * has room for them rather than a menu.
 */
export function MemberActionList({
  actions,
  busy,
  compact,
}: {
  actions: MemberAction[];
  busy?: boolean;
  compact?: boolean;
}) {
  if (!actions.length) return null;
  const groups = (['voice', 'moderation', 'ownership'] as const)
    .map((group) => actions.filter((action) => action.group === group))
    .filter((group) => group.length);
  return (
    <div className="member-actions flex flex-col gap-1">
      {groups.map((group, index) => (
        <div key={index} className={cn('flex flex-col', index > 0 && 'border-t border-border pt-1')}>
          {group.map((action) => (
            <button
              key={action.id}
              type="button"
              disabled={busy}
              className={cn(
                'flex w-full items-center gap-2 rounded-md px-2 text-left font-medium transition-colors disabled:opacity-50',
                compact ? 'h-8 text-xs' : 'h-9 text-sm',
                action.tone === 'danger'
                  ? 'text-destructive hover:bg-destructive hover:text-destructive-foreground'
                  : 'text-foreground hover:bg-accent',
              )}
              onClick={action.run}
            >
              <action.icon className={compact ? 'size-3.5' : 'size-4'} aria-hidden="true" />
              {action.label}
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}

/**
 * A member's actions as a section of its own, dialogs included, for a card
 * that is about one person: their full profile, their tile in a call.
 */
export function MemberActionsSection({
  member,
  title = 'Manage',
  compact,
  ...options
}: Parameters<typeof useMemberActions>[0] & { member: CommunityMember; title?: string; compact?: boolean }) {
  const { actionsFor, dialogs, busy, error } = useMemberActions(options);
  const actions = actionsFor(member);
  if (!actions.length) return null;
  return (
    <section className="member-actions-section space-y-1.5" aria-label={title}>
      <h3 className="px-2 text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">{title}</h3>
      <MemberActionList actions={actions} busy={busy} compact={compact} />
      {error && (
        <p className="rounded-md bg-destructive/10 px-2 py-1 text-xs text-destructive" role="alert">
          {error}
        </p>
      )}
      {dialogs}
    </section>
  );
}
