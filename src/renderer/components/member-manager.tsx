import { useEffect, useState } from 'react';
import { Clock, Crown, Headphones, MicOff, MoreVertical, PhoneOff } from 'lucide-react';
import type { Ban, CommunityDetail, CommunityMember } from '../../shared/community';
import { Permission } from '../../shared/permissions';
import { canTouchRole, myAccess, outranks, rolesOf } from '../domain/access';
import type { CommunityClient } from '../infrastructure/community-client';
import { Avatar } from './avatar';
import { ConfirmDialog, type Confirmation } from './confirm-dialog';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from './ui/dropdown-menu';
import { Tooltip } from './ui/tooltip';

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

/**
 * Everybody in the server, with what they hold and what can be done to them.
 * A menu only offers what the service would allow: the actions somebody has
 * the permission for, on people below them, and the roles below them.
 */
export function MemberManager({
  api,
  detail,
  userId,
  onChanged,
  onRemoved,
}: {
  api: CommunityClient;
  detail: CommunityDetail;
  userId: string;
  onChanged(): Promise<void>;
  onRemoved?(): void;
}) {
  const access = myAccess(detail, userId);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [confirmation, setConfirmation] = useState<Confirmation>();
  const [openMenu, setOpenMenu] = useState<string>();
  const base = `/api/servers/${detail.server.id}`;
  const assignable = (detail.roles ?? [])
    .filter((role) => !role.isDefault && canTouchRole(access, role))
    .sort((a, b) => b.position - a.position);

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

  return (
    <div className="space-y-3">
      <div className="member-list divide-y divide-border overflow-hidden rounded-lg border border-border bg-background/35">
        {detail.members.map((member) => {
          const below = outranks(access, detail, member, userId);
          const self = member.id === userId;
          const held = rolesOf(detail, member);
          const canRoles = access.can(Permission.ManageRoles) && (self || access.isOwner || below) && assignable.length > 0;
          const timedOut = Boolean(member.timeoutUntil && new Date(member.timeoutUntil) > new Date());
          const actions = {
            roles: canRoles,
            timeout: below && access.can(Permission.TimeoutMembers),
            mute: below && access.can(Permission.MuteMembers),
            deafen: below && access.can(Permission.DeafenMembers),
            disconnect: below && access.can(Permission.DisconnectMembers),
            kick: below && access.can(Permission.KickMembers),
            ban: below && access.can(Permission.BanMembers),
            transfer: access.isOwner && !self,
          };
          const anything = Object.values(actions).some(Boolean);
          return (
            <div
              className="member-row flex min-h-14 items-center gap-3 px-3.5 py-2 text-sm transition-colors hover:bg-accent/40"
              key={member.id}
            >
              <Avatar
                className="grid size-9 shrink-0 place-items-center rounded-full bg-secondary text-[11px] font-bold text-secondary-foreground"
                name={member.displayName}
                imageId={member.avatarId}
              />
              <div className="flex min-w-0 flex-1 flex-col gap-1 leading-tight">
                <strong className="flex min-w-0 items-center gap-1.5 font-semibold" title={member.displayName}>
                  <span className="truncate">
                    {member.displayName}
                    {self ? ' (you)' : ''}
                  </span>
                  {member.role === 'owner' && (
                    <Crown className="size-3.5 shrink-0 text-warning" aria-label="Owner" />
                  )}
                  {timedOut && (
                    <Tooltip label={`In a timeout until ${new Date(member.timeoutUntil!).toLocaleString()}`}>
                      <Clock className="size-3.5 shrink-0 text-muted-foreground" aria-label="In a timeout" />
                    </Tooltip>
                  )}
                  {member.muted && <MicOff className="size-3.5 shrink-0 text-destructive" aria-label="Muted by the server" />}
                  {member.deafened && (
                    <Headphones className="size-3.5 shrink-0 text-destructive" aria-label="Deafened by the server" />
                  )}
                </strong>
                <span className="flex min-w-0 flex-wrap items-center gap-1">
                  <small className="mr-1 truncate text-xs text-muted-foreground">@{member.username}</small>
                  {held.map((role) => (
                    <span
                      key={role.id}
                      className="member-role inline-flex items-center gap-1 rounded-md border border-border bg-secondary/60 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground"
                    >
                      <span className="size-1.5 rounded-full" style={{ background: role.colour ?? 'currentColor' }} />
                      {role.name}
                    </span>
                  ))}
                </span>
              </div>
              {anything && (
                <DropdownMenu
                  open={openMenu === member.id}
                  onOpenChange={(open) => setOpenMenu(open ? member.id : undefined)}
                >
                  <DropdownMenuTrigger asChild>
                    <button
                      className="icon-action grid size-8 shrink-0 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                      disabled={busy}
                      aria-label={`Manage ${member.displayName}`}
                      type="button"
                    >
                      <MoreVertical aria-hidden="true" className="size-4" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {actions.roles && (
                      <DropdownMenuSub>
                        <DropdownMenuSubTrigger>Roles</DropdownMenuSubTrigger>
                        <DropdownMenuSubContent>
                          <DropdownMenuLabel>Roles you can give</DropdownMenuLabel>
                          {assignable.map((role) => {
                            const has = member.roleIds?.includes(role.id) ?? false;
                            return (
                              <DropdownMenuCheckboxItem
                                key={role.id}
                                checked={has}
                                onSelect={(event) => event.preventDefault()}
                                onCheckedChange={(checked) =>
                                  void run(() =>
                                    api.request(`${base}/members/${member.id}/roles`, 'PUT', {
                                      roleIds: checked
                                        ? [...(member.roleIds ?? []), role.id]
                                        : (member.roleIds ?? []).filter((id) => id !== role.id),
                                    }),
                                  )
                                }
                              >
                                <span className="size-2.5 rounded-full" style={{ background: role.colour ?? 'var(--muted-foreground)' }} />
                                {role.name}
                              </DropdownMenuCheckboxItem>
                            );
                          })}
                        </DropdownMenuSubContent>
                      </DropdownMenuSub>
                    )}
                    {actions.timeout &&
                      (timedOut ? (
                        <DropdownMenuItem onSelect={() => moderate(member, { timeoutMinutes: null })}>
                          Remove timeout
                        </DropdownMenuItem>
                      ) : (
                        <DropdownMenuSub>
                          <DropdownMenuSubTrigger>Timeout</DropdownMenuSubTrigger>
                          <DropdownMenuSubContent>
                            {timeoutChoices.map((choice) => (
                              <DropdownMenuItem
                                key={choice.minutes}
                                onSelect={() => moderate(member, { timeoutMinutes: choice.minutes })}
                              >
                                {choice.label}
                              </DropdownMenuItem>
                            ))}
                          </DropdownMenuSubContent>
                        </DropdownMenuSub>
                      ))}
                    {actions.mute && (
                      <DropdownMenuItem onSelect={() => moderate(member, { muted: !member.muted })}>
                        {member.muted ? 'Unmute in this server' : 'Mute in this server'}
                      </DropdownMenuItem>
                    )}
                    {actions.deafen && (
                      <DropdownMenuItem onSelect={() => moderate(member, { deafened: !member.deafened })}>
                        {member.deafened ? 'Undeafen in this server' : 'Deafen in this server'}
                      </DropdownMenuItem>
                    )}
                    {actions.disconnect && (
                      <DropdownMenuItem
                        onSelect={() => void run(() => api.request(`${base}/members/${member.id}/disconnect`, 'POST'))}
                      >
                        <PhoneOff className="size-4" /> Disconnect from voice
                      </DropdownMenuItem>
                    )}
                    {actions.transfer && (
                      <DropdownMenuItem
                        onSelect={() =>
                          setConfirmation({
                            title: 'Transfer ownership',
                            description: `Make ${member.displayName} the owner of ${detail.server.name}? You keep the roles you hold, and only they will be able to give it back.`,
                            confirmLabel: 'Transfer',
                            action: async () => {
                              await api.request(`${base}/transfer`, 'POST', { userId: member.id });
                            },
                          })
                        }
                      >
                        Transfer ownership
                      </DropdownMenuItem>
                    )}
                    {(actions.kick || actions.ban) && <DropdownMenuSeparator />}
                    {actions.kick && (
                      <DropdownMenuItem
                        className="text-destructive focus:bg-destructive focus:text-destructive-foreground data-[highlighted]:bg-destructive data-[highlighted]:text-destructive-foreground"
                        onSelect={() =>
                          setConfirmation({
                            title: 'Kick member',
                            description: `Remove ${member.displayName} from ${detail.server.name}? They can come back with a new invitation.`,
                            confirmLabel: 'Kick',
                            tone: 'danger',
                            action: async () => {
                              await api.request(`${base}/members/${member.id}`, 'DELETE');
                            },
                          })
                        }
                      >
                        Kick
                      </DropdownMenuItem>
                    )}
                    {actions.ban && (
                      <DropdownMenuItem
                        className="text-destructive focus:bg-destructive focus:text-destructive-foreground data-[highlighted]:bg-destructive data-[highlighted]:text-destructive-foreground"
                        onSelect={() =>
                          setConfirmation({
                            title: 'Ban member',
                            description: `Ban ${member.displayName} from ${detail.server.name}? They are removed now and every invitation will refuse them until the ban is lifted.`,
                            confirmLabel: 'Ban',
                            tone: 'danger',
                            action: async () => {
                              await api.request(`${base}/bans`, 'POST', { userId: member.id });
                            },
                          })
                        }
                      >
                        Ban
                      </DropdownMenuItem>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          );
        })}
      </div>
      {error && (
        <p className="form-error rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive" role="alert">
          {error}
        </p>
      )}
      {confirmation && (
        <ConfirmDialog
          confirmation={confirmation}
          busy={busy}
          onCancel={() => setConfirmation(undefined)}
          onConfirm={() =>
            void run(async () => {
              await confirmation.action();
              if (confirmation.title === 'Transfer ownership') onRemoved?.();
            })
          }
        />
      )}
    </div>
  );
}

/** Who is banned, and the way back for each of them. */
export function BanList({ api, serverId }: { api: CommunityClient; serverId: string }) {
  const [bans, setBans] = useState<Ban[]>();
  const [error, setError] = useState('');
  const load = () =>
    api
      .request<{ bans: Ban[] }>(`/api/servers/${serverId}/bans`)
      .then((result) => setBans(result.bans))
      .catch((e) => setError(errorMessage(e)));
  useEffect(() => {
    void load();
  }, [serverId]);
  if (!bans) return <p className="text-xs text-muted-foreground">{error || 'Loading…'}</p>;
  return (
    <div className="space-y-3">
      {bans.length ? (
        <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-background/35">
          {bans.map((ban) => (
            <li key={ban.userId} className="flex min-h-14 items-center gap-3 px-3.5 py-2 text-sm">
              <Avatar
                className="grid size-8 shrink-0 place-items-center rounded-full bg-secondary text-[10px] font-bold"
                name={ban.displayName}
                imageId={ban.avatarId}
              />
              <span className="flex min-w-0 flex-1 flex-col leading-tight">
                <strong className="truncate font-semibold">{ban.displayName}</strong>
                <small className="truncate text-xs text-muted-foreground">
                  @{ban.username}
                  {ban.reason ? ` · ${ban.reason}` : ''}
                </small>
              </span>
              <button
                type="button"
                className="rounded-md px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                onClick={() =>
                  void api
                    .request(`/api/servers/${serverId}/bans/${ban.userId}`, 'DELETE')
                    .then(load)
                    .catch((e) => setError(errorMessage(e)))
                }
              >
                Lift ban
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <div className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-xs text-muted-foreground">
          Nobody is banned.
        </div>
      )}
      {error && (
        <p className="text-xs text-destructive" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
