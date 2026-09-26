import { useMemo, useState } from 'react';
import { Check, Plus, ShieldHalf, Slash, Trash2, UserRound, X } from 'lucide-react';
import type { CommunityDetail } from '../../shared/community';
import {
  channelScoped,
  has,
  permissionGroups,
  type PermissionInfo,
  type PermissionOverride,
} from '../../shared/permissions';
import { canTouchRole, outranks, type MyAccess } from '../domain/access';
import { Avatar } from './avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './ui/dropdown-menu';
import { cn } from './ui/utils';

export type OverrideScope = 'text' | 'voice' | 'category';
type State = 'allow' | 'inherit' | 'deny';

const keyOf = (o: Pick<PermissionOverride, 'targetType' | 'targetId'>) => `${o.targetType}:${o.targetId}`;

/** The permissions that mean something in this kind of place. */
export function scopedGroups(scope: OverrideScope): { title: string; items: PermissionInfo[] }[] {
  return permissionGroups
    .map((group) => ({
      ...group,
      items: group.items.filter(
        (item) =>
          has(channelScoped, item.flag) && (scope === 'category' || !item.channelType || item.channelType === scope),
      ),
    }))
    .filter((group) => group.items.length > 0);
}

const stateOf = (override: PermissionOverride | undefined, flag: number): State =>
  !override ? 'inherit' : has(override.allow, flag) ? 'allow' : has(override.deny, flag) ? 'deny' : 'inherit';

/**
 * Who may do what in one channel or category, beyond what their roles say.
 *
 * Each role or person listed has every permission in one of three states:
 * inherit (the roles decide), allow, or deny. Inherit is not the same as
 * allow: it is the absence of an answer, and it is what lets a category, or a
 * role, still decide.
 *
 * The controls a person could not use are drawn but disabled, the way the
 * service would refuse them: a role at or above their own, somebody at or
 * above them, a permission they do not hold themselves.
 */
export function PermissionOverridesEditor({
  detail,
  userId,
  access,
  actorPermissions,
  scope,
  overrides,
  disabled,
  onChange,
}: {
  detail: CommunityDetail;
  userId: string;
  access: MyAccess;
  /** What the person editing may do in this place, which bounds what they may grant. */
  actorPermissions: number;
  scope: OverrideScope;
  overrides: PermissionOverride[];
  disabled?: boolean;
  onChange(next: PermissionOverride[]): void;
}) {
  const roles = detail.roles ?? [];
  const everyone = roles.find((role) => role.isDefault);
  // @everyone is always listed: it is where "private" is decided.
  const targets = useMemo(() => {
    const listed = new Map(overrides.map((o) => [keyOf(o), o]));
    if (everyone && !listed.has(`role:${everyone.id}`))
      listed.set(`role:${everyone.id}`, { targetType: 'role', targetId: everyone.id, allow: 0, deny: 0 });
    const rank = (o: PermissionOverride) =>
      o.targetType === 'role' ? (roles.find((role) => role.id === o.targetId)?.position ?? -1) : -2;
    return [...listed.values()].sort((a, b) => {
      if (a.targetId === everyone?.id) return -1;
      if (b.targetId === everyone?.id) return 1;
      return rank(b) - rank(a);
    });
  }, [overrides, roles, everyone]);
  const [selected, setSelected] = useState(() => (everyone ? `role:${everyone.id}` : ''));
  const current = targets.find((o) => keyOf(o) === selected) ?? targets[0];

  const labelOf = (o: PermissionOverride) =>
    o.targetType === 'role'
      ? (roles.find((role) => role.id === o.targetId)?.name ?? 'Deleted role')
      : (detail.members.find((member) => member.id === o.targetId)?.displayName ?? 'Somebody who left');
  const editable = (o: PermissionOverride) => {
    if (disabled) return false;
    if (access.isAdministrator) return true;
    if (o.targetType === 'role') {
      const role = roles.find((entry) => entry.id === o.targetId);
      return Boolean(role && canTouchRole(access, role));
    }
    if (o.targetId === userId) return true;
    const member = detail.members.find((entry) => entry.id === o.targetId);
    return Boolean(member && outranks(access, detail, member, userId));
  };
  const grantable = (flag: number) => access.isAdministrator || has(actorPermissions, flag);

  const write = (next: PermissionOverride) => {
    onChange([...overrides.filter((o) => keyOf(o) !== keyOf(next)), next]);
  };
  const setState = (o: PermissionOverride, flag: number, state: State) =>
    write({
      ...o,
      allow: state === 'allow' ? o.allow | flag : o.allow & ~flag,
      deny: state === 'deny' ? o.deny | flag : o.deny & ~flag,
    });
  const remove = (o: PermissionOverride) => {
    onChange(overrides.filter((entry) => keyOf(entry) !== keyOf(o)));
    setSelected(everyone ? `role:${everyone.id}` : '');
  };
  const add = (o: PermissionOverride) => {
    onChange([...overrides, o]);
    setSelected(keyOf(o));
  };

  const addableRoles = roles.filter(
    (role) => !role.isDefault && !targets.some((o) => o.targetType === 'role' && o.targetId === role.id),
  );
  const addableMembers = detail.members.filter(
    (member) => !targets.some((o) => o.targetType === 'member' && o.targetId === member.id),
  );

  return (
    <div className="permission-overrides grid min-h-0 gap-4 md:grid-cols-[13rem_minmax(0,1fr)]">
      <div className="flex min-w-0 flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
            Roles and members
          </span>
          {!disabled && (addableRoles.length > 0 || addableMembers.length > 0) && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="grid size-6 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  aria-label="Add a role or member"
                >
                  <Plus className="size-3.5" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {addableRoles.length > 0 && <DropdownMenuLabel>Roles</DropdownMenuLabel>}
                {addableRoles.map((role) => (
                  <DropdownMenuItem
                    key={role.id}
                    onSelect={() => add({ targetType: 'role', targetId: role.id, allow: 0, deny: 0 })}
                  >
                    <span className="size-2.5 rounded-full" style={{ background: role.colour ?? 'var(--muted-foreground)' }} />
                    {role.name}
                  </DropdownMenuItem>
                ))}
                {addableRoles.length > 0 && addableMembers.length > 0 && <DropdownMenuSeparator />}
                {addableMembers.length > 0 && <DropdownMenuLabel>Members</DropdownMenuLabel>}
                {addableMembers.map((member) => (
                  <DropdownMenuItem
                    key={member.id}
                    onSelect={() => add({ targetType: 'member', targetId: member.id, allow: 0, deny: 0 })}
                  >
                    <UserRound className="size-3.5" />
                    {member.displayName}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
        <div className="flex flex-col gap-0.5" role="listbox" aria-label="Roles and members with permissions here">
          {targets.map((o) => {
            const member = o.targetType === 'member' ? detail.members.find((m) => m.id === o.targetId) : undefined;
            const role = o.targetType === 'role' ? roles.find((r) => r.id === o.targetId) : undefined;
            const active = keyOf(o) === keyOf(current);
            return (
              <button
                key={keyOf(o)}
                type="button"
                role="option"
                aria-selected={active}
                className={cn(
                  'flex h-9 min-w-0 items-center gap-2 rounded-md px-2 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  active ? 'bg-accent text-foreground' : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground',
                )}
                onClick={() => setSelected(keyOf(o))}
              >
                {member ? (
                  <Avatar
                    className="grid size-5 shrink-0 place-items-center rounded-full bg-secondary text-[8px] font-bold"
                    name={member.displayName}
                    imageId={member.avatarId}
                  />
                ) : (
                  <ShieldHalf className="size-4 shrink-0" style={role?.colour ? { color: role.colour } : undefined} />
                )}
                <span className="min-w-0 flex-1 truncate">{labelOf(o)}</span>
                {(o.allow !== 0 || o.deny !== 0) && (
                  <span className="font-mono text-[10px] text-muted-foreground" aria-hidden="true">
                    {countBits(o.allow | o.deny)}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {current && (
        <div className="min-w-0 space-y-4" aria-label={`Permissions for ${labelOf(current)}`} role="group">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <h4 className="truncate text-sm font-semibold text-foreground">{labelOf(current)}</h4>
              <p className="text-[11px] text-muted-foreground">
                {editable(current)
                  ? 'Inherit leaves it to their roles and, in a synced channel, to the category.'
                  : 'This role or person stands at or above you, so you cannot change it.'}
              </p>
            </div>
            {current.targetId !== everyone?.id && editable(current) && (
              <button
                type="button"
                className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                onClick={() => remove(current)}
              >
                <Trash2 className="size-3.5" /> Remove
              </button>
            )}
          </div>
          {scopedGroups(scope).map((group) => (
            <section key={group.title} className="space-y-1">
              <h5 className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                {group.title}
              </h5>
              <div className="divide-y divide-border/70 overflow-hidden rounded-lg border border-border bg-background/40">
                {group.items.map((item) => (
                  <div key={item.flag} className="permission-override-row flex items-center gap-3 px-3 py-2.5">
                    <span className="flex min-w-0 flex-1 flex-col">
                      <strong className="text-[13px] font-medium text-foreground">{item.label}</strong>
                      <small className="text-[11px] leading-4 text-muted-foreground">{item.description}</small>
                    </span>
                    <TriState
                      label={item.label}
                      value={stateOf(current, item.flag)}
                      disabled={!editable(current) || !grantable(item.flag)}
                      onChange={(state) => setState(current, item.flag, state)}
                    />
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function countBits(value: number): number {
  let count = 0;
  for (let rest = value; rest; rest &= rest - 1) count += 1;
  return count;
}

/** Deny, inherit, allow: three states in one control, read left to right. */
function TriState({
  label,
  value,
  disabled,
  onChange,
}: {
  label: string;
  value: State;
  disabled?: boolean;
  onChange(value: State): void;
}) {
  const options: { state: State; name: string; icon: typeof Check; active: string }[] = [
    { state: 'deny', name: 'Deny', icon: X, active: 'bg-destructive text-destructive-foreground' },
    { state: 'inherit', name: 'Inherit', icon: Slash, active: 'bg-secondary text-foreground' },
    { state: 'allow', name: 'Allow', icon: Check, active: 'bg-success text-background' },
  ];
  return (
    <div
      className="tri-state flex shrink-0 overflow-hidden rounded-md border border-border"
      role="radiogroup"
      aria-label={label}
    >
      {options.map(({ state, name, icon: Icon, active }) => (
        <button
          key={state}
          type="button"
          role="radio"
          aria-checked={value === state}
          aria-label={name}
          title={name}
          disabled={disabled}
          className={cn(
            'grid size-7 place-items-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-45',
            value === state ? active : 'text-muted-foreground hover:bg-accent',
          )}
          onClick={() => onChange(state)}
        >
          <Icon className="size-3.5" aria-hidden="true" />
        </button>
      ))}
    </div>
  );
}

