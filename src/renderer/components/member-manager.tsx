import { Fragment, useEffect, useState } from 'react';
import { Clock, Crown, Headphones, MicOff, MoreVertical, Search, Users, X } from 'lucide-react';
import type { Ban, CommunityDetail, CommunityMember } from '../../shared/community';
import { rolesOf } from '../domain/access';
import type { CommunityClient } from '../infrastructure/community-client';
import { Avatar } from './avatar';
import { RoleMark } from './role-appearance';
import { useMemberActions, type VoiceSeat } from './member-actions';
import { ProfileModal } from './profile-modal';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './ui/dropdown-menu';
import { Tooltip } from './ui/tooltip';
import { cn } from './ui/utils';

const errorMessage = (error: unknown) => (error instanceof Error ? error.message : 'Something went wrong.');
const restricted = (member: CommunityMember) =>
  Boolean(
    member.muted || member.deafened || (member.timeoutUntil && new Date(member.timeoutUntil) > new Date()),
  );
const joinedDate = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

export { timeoutChoices } from './member-actions';

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
  seatOf,
}: {
  api: CommunityClient;
  detail: CommunityDetail;
  userId: string;
  onChanged(): Promise<void>;
  seatOf?(accountId: string): VoiceSeat | undefined;
}) {
  const { actionsFor, dialogs, busy, error } = useMemberActions({ api, detail, userId, onChanged, seatOf });
  // One row's menu at a time, held here rather than in each row, so reaching
  // for a second member puts the first one away.
  const [openMenu, setOpenMenu] = useState<string>();
  const [profileId, setProfileId] = useState<string>();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<'all' | 'team' | 'restricted'>('all');
  const profile = detail.members.find((member) => member.id === profileId);
  const filters = [
    { id: 'all' as const, label: 'All members', count: detail.members.length },
    {
      id: 'team' as const,
      label: 'Team',
      count: detail.members.filter((member) => member.role !== 'member').length,
    },
    { id: 'restricted' as const, label: 'Restricted', count: detail.members.filter(restricted).length },
  ];
  const visible = detail.members.filter(
    (member) =>
      (filter === 'all' || (filter === 'team' ? member.role !== 'member' : restricted(member))) &&
      `${member.displayName} ${member.username}`
        .toLocaleLowerCase()
        .includes(query.trim().toLocaleLowerCase()),
  );

  return (
    <div className="member-directory space-y-3">
      <div className="directory-toolbar">
        <div className="directory-title">
          <Users size={17} aria-hidden="true" />
          <span>Member directory</span>
          <span>{detail.members.length}</span>
        </div>
        <label className="directory-search">
          <Search size={15} aria-hidden="true" />
          <input
            aria-label="Search members"
            placeholder="Search by name or username"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          {query && (
            <button type="button" aria-label="Clear member search" onClick={() => setQuery('')}>
              <X size={13} />
            </button>
          )}
        </label>
      </div>
      <div className="directory-filters" role="group" aria-label="Filter members">
        {filters.map((option) => (
          <button
            key={option.id}
            type="button"
            aria-pressed={filter === option.id}
            onClick={() => setFilter(option.id)}
          >
            {option.label}
            <span>{option.count}</span>
          </button>
        ))}
      </div>
      <div className="member-list divide-y divide-border overflow-hidden rounded-lg border border-border bg-background/35">
        <div className="directory-columns" aria-hidden="true">
          <span>Member</span>
          <span>Roles & access</span>
          <span>Joined server</span>
          <span />
        </div>
        {visible.map((member) => {
          const self = member.id === userId;
          const held = rolesOf(detail, member);
          const timedOut = Boolean(member.timeoutUntil && new Date(member.timeoutUntil) > new Date());
          const actions = actionsFor(member);
          const groups = (['voice', 'moderation', 'ownership'] as const)
            .map((group) => actions.filter((action) => action.group === group))
            .filter((group) => group.length);
          return (
            <div
              className="member-row flex min-h-14 items-center gap-3 px-3.5 py-2 text-sm transition-colors hover:bg-accent/40"
              key={member.id}
            >
              {/* The face and the name open the whole profile, as they do everywhere. */}
              <button
                type="button"
                className="shrink-0 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label={`Open ${member.displayName}'s full profile`}
                onClick={() => setProfileId(member.id)}
              >
                <Avatar
                  className="grid size-9 place-items-center rounded-full bg-secondary text-[11px] font-bold text-secondary-foreground"
                  name={member.displayName}
                  imageId={member.avatarId}
                />
              </button>
              <div className="flex min-w-0 flex-1 flex-col gap-1 leading-tight">
                <strong
                  className="flex min-w-0 items-center gap-1.5 font-semibold"
                  title={member.displayName}
                >
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
                  {member.muted && (
                    <MicOff className="size-3.5 shrink-0 text-destructive" aria-label="Muted by the server" />
                  )}
                  {member.deafened && (
                    <Headphones
                      className="size-3.5 shrink-0 text-destructive"
                      aria-label="Deafened by the server"
                    />
                  )}
                </strong>
                <span className="flex min-w-0 flex-wrap items-center gap-1">
                  <small className="mr-1 truncate text-xs text-muted-foreground">@{member.username}</small>
                </span>
              </div>
              <div className="member-role-stack">
                <span className="member-access">
                  {member.role === 'owner' ? 'Owner' : member.role === 'admin' ? 'Administrator' : 'Member'}
                </span>
                {held.map((role) => (
                  <span
                    key={role.id}
                    className="member-role inline-flex items-center gap-1 rounded-md border border-border bg-secondary/60 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground"
                  >
                    <RoleMark role={role} />
                    {role.name}
                  </span>
                ))}
                {restricted(member) && (
                  <small className="member-restriction">
                    {timedOut ? 'Timed out' : member.deafened ? 'Deafened' : 'Server muted'}
                  </small>
                )}
              </div>
              <div className="member-joined">
                {member.joinedAt ? (
                  <time dateTime={member.joinedAt}>{joinedDate.format(new Date(member.joinedAt))}</time>
                ) : (
                  <span>Not recorded</span>
                )}
              </div>
              <div className="member-row-action">
                {actions.length > 0 && (
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
                      {groups.map((group, index) => (
                        <Fragment key={index}>
                          {index > 0 && <DropdownMenuSeparator />}
                          {group.map((action) => (
                            <DropdownMenuItem
                              key={action.id}
                              className={cn(
                                action.tone === 'danger' &&
                                  'text-destructive hover:bg-destructive hover:text-destructive-foreground focus:bg-destructive focus:text-destructive-foreground data-[highlighted]:bg-destructive data-[highlighted]:text-destructive-foreground',
                              )}
                              onSelect={action.run}
                            >
                              <action.icon className="size-4" aria-hidden="true" />
                              {action.label}
                            </DropdownMenuItem>
                          ))}
                        </Fragment>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>
            </div>
          );
        })}
        {visible.length === 0 && (
          <div className="directory-empty">
            <Search size={22} aria-hidden="true" />
            <strong>No members found</strong>
            <p>Try another name or choose a different filter.</p>
            <button
              type="button"
              onClick={() => {
                setQuery('');
                setFilter('all');
              }}
            >
              Show all members
            </button>
          </div>
        )}
      </div>
      <footer className="directory-footer">
        <span>
          Showing {visible.length} of {detail.members.length} members
        </span>
        <span>Profiles, roles and server access</span>
      </footer>
      {error && (
        <p
          className="form-error rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive"
          role="alert"
        >
          {error}
        </p>
      )}
      {dialogs}
      {profile && (
        <ProfileModal
          api={api}
          detail={detail}
          userId={userId}
          member={profile}
          seatOf={seatOf}
          seat={seatOf?.(profile.id)}
          onChanged={onChanged}
          onClose={() => setProfileId(undefined)}
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
