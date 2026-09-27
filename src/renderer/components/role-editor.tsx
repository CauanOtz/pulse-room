import { useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, GripVertical, Lock, Plus, ShieldAlert, Trash2, UserPlus, X } from 'lucide-react';
import type { CommunityDetail, Role } from '../../shared/community';
import { administratorInfo, has, Permission, permissionGroups } from '../../shared/permissions';
import { canTouchRole, myAccess, outranks } from '../domain/access';
import type { CommunityClient } from '../infrastructure/community-client';
import { Avatar } from './avatar';
import { ConfirmDialog } from './confirm-dialog';
import { ToggleRow } from './channel-dialogs';
import { Modal } from './modal';
import { ColourField } from './profile-editors';
import { cn } from './ui/utils';

const errorMessage = (error: unknown) => (error instanceof Error ? error.message : 'Something went wrong.');
const primaryClass =
  'primary-action inline-flex h-8 items-center justify-center gap-2 rounded-md bg-primary px-3.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50';

interface Draft {
  name: string;
  colour: string | null;
  permissions: number;
  hoist: boolean;
}
const draftOf = (role: Role): Draft => ({
  name: role.name,
  colour: role.colour,
  permissions: role.permissions,
  hoist: role.hoist,
});

/**
 * The server's roles, highest first, and the one being edited beside them.
 *
 * Order is authority: a role can be dragged, or moved with the arrows, but
 * only below the editor's own highest role, and the roles above it are shown
 * locked. What a role may do is edited in groups, with Administrator apart and
 * red, since it overrides every other switch and every channel.
 */
export function RoleEditor({
  api,
  detail,
  userId,
  onChanged,
}: {
  api: CommunityClient;
  detail: CommunityDetail;
  userId: string;
  onChanged(): Promise<void>;
}) {
  const access = myAccess(detail, userId);
  const roles = detail.roles ?? [];
  const ordered = useMemo(() => [...roles].sort((a, b) => b.position - a.position), [roles]);
  const [selectedId, setSelectedId] = useState<string>(() => ordered.find((role) => !role.isDefault)?.id ?? ordered[0]?.id);
  const selected = roles.find((role) => role.id === selectedId) ?? ordered[0];
  const [tab, setTab] = useState<'overview' | 'permissions' | 'members'>('overview');
  const [draft, setDraft] = useState<Draft | undefined>(selected && draftOf(selected));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [dragging, setDragging] = useState<string>();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const selectedKey = selected ? JSON.stringify(draftOf(selected)) : '';
  // The saved role comes back from the service after a save; the draft
  // follows it, and what the save said stays until another role is opened.
  useEffect(() => {
    if (selected) setDraft(draftOf(selected));
  }, [selected?.id, selectedKey]);
  useEffect(() => setMessage(''), [selected?.id]);

  if (!selected || !draft) return null;
  const editable = canTouchRole(access, selected);
  const dirty = JSON.stringify(draft) !== selectedKey;
  const members = detail.members.filter((member) => member.roleIds?.includes(selected.id));

  async function run(action: () => Promise<unknown>, done?: string) {
    setBusy(true);
    setMessage('');
    try {
      await action();
      await onChanged();
      if (done) setMessage(done);
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }
  const base = `/api/servers/${detail.server.id}`;
  const movable = ordered.filter((role) => !role.isDefault);
  const reorder = (ids: string[]) => void run(() => api.request(`${base}/roles`, 'PUT', { roleIds: ids }));
  const move = (roleId: string, offset: number) => {
    const ids = movable.map((role) => role.id);
    const from = ids.indexOf(roleId);
    const to = from + offset;
    if (to < 0 || to >= ids.length) return;
    [ids[from], ids[to]] = [ids[to], ids[from]];
    reorder(ids);
  };
  const dropOn = (targetId: string) => {
    if (!dragging || dragging === targetId) return;
    const ids = movable.map((role) => role.id).filter((id) => id !== dragging);
    ids.splice(ids.indexOf(targetId), 0, dragging);
    setDragging(undefined);
    reorder(ids);
  };
  // A role is made in a dialog: its name, colour and place in the member
  // list first, then what it may do, on the Permissions tab it opens on.
  const [creating, setCreating] = useState(false);
  const [fresh, setFresh] = useState({ name: '', colour: null as string | null, hoist: false });
  const [problem, setProblem] = useState('');
  const create = async () => {
    setBusy(true);
    setProblem('');
    try {
      const { id } = await api.request<{ id: string }>(`${base}/roles`, 'POST', {
        name: fresh.name.trim(),
        colour: fresh.colour,
        permissions: 0,
        hoist: fresh.hoist,
      });
      await onChanged();
      setCreating(false);
      setSelectedId(id);
      setTab('permissions');
    } catch (error) {
      setProblem(errorMessage(error));
    } finally {
      setBusy(false);
    }
  };
  // People are added to a role in a dialog too, several at a time.
  const [adding, setAdding] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const addPicked = async () => {
    setBusy(true);
    setProblem('');
    try {
      for (const memberId of picked) {
        const member = detail.members.find((entry) => entry.id === memberId)!;
        await api.request(`${base}/members/${memberId}/roles`, 'PUT', {
          roleIds: [...(member.roleIds ?? []), selected.id],
        });
      }
      await onChanged();
      setAdding(false);
    } catch (error) {
      setProblem(errorMessage(error));
    } finally {
      setBusy(false);
    }
  };
  // Somebody below you may be given this role only if it is below you too.
  const candidates = detail.members.filter(
    (member) =>
      !member.roleIds?.includes(selected.id) &&
      (member.id === userId || access.isOwner || outranks(access, detail, member, userId)),
  );
  const setMemberRole = (memberId: string, give: boolean) => {
    const member = detail.members.find((entry) => entry.id === memberId)!;
    const roleIds = give
      ? [...(member.roleIds ?? []), selected.id]
      : (member.roleIds ?? []).filter((id) => id !== selected.id);
    void run(() => api.request(`${base}/members/${memberId}/roles`, 'PUT', { roleIds }));
  };
  const grantable = (flag: number) => access.isAdministrator || has(access.permissions, flag);
  const toggle = (flag: number, on: boolean) =>
    setDraft({ ...draft, permissions: on ? draft.permissions | flag : draft.permissions & ~flag });

  return (
    <div className="role-editor grid min-h-0 gap-5 md:grid-cols-[14rem_minmax(0,1fr)]">
      {/* The list stays in view while a long list of permissions scrolls past. */}
      <div className="flex min-w-0 flex-col gap-2 self-start md:sticky md:top-8">
        <button
          type="button"
          className={cn(primaryClass, 'w-full')}
          disabled={busy || !access.can(Permission.ManageRoles)}
          onClick={() => {
            setFresh({ name: '', colour: null, hoist: false });
            setProblem('');
            setCreating(true);
          }}
        >
          <Plus className="size-3.5" /> Create role
        </button>
        <ol className="flex flex-col gap-0.5" aria-label="Roles, highest first">
          {ordered.map((role) => {
            const locked = !canTouchRole(access, role);
            const count = detail.members.filter((member) => member.roleIds?.includes(role.id)).length;
            const index = movable.findIndex((entry) => entry.id === role.id);
            const draggable = !role.isDefault && !locked && !busy;
            return (
              <li
                key={role.id}
                draggable={draggable}
                onDragStart={() => setDragging(role.id)}
                onDragEnd={() => setDragging(undefined)}
                onDragOver={(event) => {
                  if (!role.isDefault && !locked && dragging) event.preventDefault();
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  dropOn(role.id);
                }}
                className={cn(
                  'role-row group/role flex h-9 items-center gap-1.5 rounded-md pr-1 text-sm transition-colors',
                  role.id === selected.id ? 'bg-accent text-foreground' : 'text-muted-foreground hover:bg-accent/60',
                  dragging === role.id && 'opacity-50',
                )}
              >
                <span className={cn('grid w-5 place-items-center', draggable ? 'cursor-grab' : 'opacity-0')} aria-hidden="true">
                  <GripVertical className="size-3.5" />
                </span>
                <button
                  type="button"
                  className="flex min-w-0 flex-1 items-center gap-2 text-left focus-visible:outline-none"
                  aria-pressed={role.id === selected.id}
                  onClick={() => {
                    setSelectedId(role.id);
                    if (role.isDefault && tab === 'members') setTab('permissions');
                  }}
                >
                  <span className="size-2.5 shrink-0 rounded-full" style={{ background: role.colour ?? 'var(--muted-foreground)' }} />
                  <span className="min-w-0 flex-1 truncate">{role.name}</span>
                  {locked && <Lock className="size-3 shrink-0" aria-label="Above your highest role" />}
                  {!role.isDefault && <span className="font-mono text-[10px]">{count}</span>}
                </button>
                {draggable && (
                  <span className="flex opacity-0 transition-opacity group-hover/role:opacity-100 group-focus-within/role:opacity-100">
                    <button
                      type="button"
                      className="grid size-5 place-items-center rounded text-muted-foreground hover:text-foreground disabled:opacity-30"
                      aria-label={`Move ${role.name} up`}
                      disabled={index === 0 || !canTouchRole(access, movable[index - 1])}
                      onClick={() => move(role.id, -1)}
                    >
                      <ArrowUp className="size-3" />
                    </button>
                    <button
                      type="button"
                      className="grid size-5 place-items-center rounded text-muted-foreground hover:text-foreground disabled:opacity-30"
                      aria-label={`Move ${role.name} down`}
                      disabled={index === movable.length - 1}
                      onClick={() => move(role.id, 1)}
                    >
                      <ArrowDown className="size-3" />
                    </button>
                  </span>
                )}
              </li>
            );
          })}
        </ol>
        <p className="px-1 text-[11px] leading-4 text-muted-foreground">
          Drag to reorder. A role can act on the roles below it, never on those above.
        </p>
      </div>

      <section className="min-w-0 space-y-4" aria-label={`Role ${selected.name}`}>
        <div className="flex items-center justify-between gap-3">
          <h3 className="truncate text-base font-semibold text-foreground">{selected.name}</h3>
          {!selected.isDefault && editable && (
            <button
              type="button"
              className="inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium text-destructive transition-colors hover:bg-destructive/10"
              disabled={busy}
              onClick={() => setConfirmDelete(true)}
            >
              <Trash2 className="size-3.5" /> Delete role
            </button>
          )}
        </div>
        <div className="flex gap-1 border-b border-border" role="tablist">
          {(
            [
              ['overview', 'Overview'],
              ['permissions', 'Permissions'],
              ['members', `Members (${members.length})`],
            ] as const
          )
            .filter(([id]) => !(selected.isDefault && (id === 'members' || id === 'overview')))
            .map(([id, label]) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={tab === id}
                className={cn(
                  '-mb-px border-b-2 px-2 py-2 text-sm font-medium transition-colors',
                  tab === id ? 'border-foreground text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground',
                )}
                onClick={() => setTab(id)}
              >
                {label}
              </button>
            ))}
        </div>
        {!editable && (
          <p className="rounded-md border border-border bg-background/45 px-3 py-2 text-xs text-muted-foreground">
            This role is at or above your highest role, so you can see it but not change it.
          </p>
        )}

        {tab === 'overview' && !selected.isDefault && (
          <div className="space-y-4">
            <label>
              Role name
              <input
                maxLength={32}
                value={draft.name}
                disabled={!editable}
                onChange={(event) => setDraft({ ...draft, name: event.target.value })}
              />
            </label>
            <div className="space-y-2">
              <ColourField
                label="Role colour"
                value={draft.colour ?? '#99aab5'}
                disabled={!editable}
                onChange={(colour) => setDraft({ ...draft, colour })}
              />
              {draft.colour && editable && (
                <button
                  type="button"
                  className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
                  onClick={() => setDraft({ ...draft, colour: null })}
                >
                  <X className="size-3" /> No colour
                </button>
              )}
              <p className="text-[11px] text-muted-foreground">
                Shown on the role and in profiles. Names stay in the room’s own colour.
              </p>
            </div>
            <div className="overflow-hidden rounded-lg border border-border bg-background/45">
              <ToggleRow
                label="Display separately"
                description="List its members under the role in the member list."
                checked={draft.hoist}
                disabled={!editable}
                onChange={(hoist) => setDraft({ ...draft, hoist })}
              />
            </div>
          </div>
        )}

        {(tab === 'permissions' || (tab === 'overview' && selected.isDefault)) && (
          <div className="space-y-4">
            {selected.isDefault && (
              <p className="text-xs text-muted-foreground">
                Everybody in the server holds @everyone. What it allows is the floor every other role builds on.
              </p>
            )}
            {permissionGroups.map((group) => (
              <section key={group.title} className="space-y-1">
                <h4 className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                  {group.title}
                </h4>
                <div className="divide-y divide-border/70 overflow-hidden rounded-lg border border-border bg-background/40">
                  {group.items.map((item) => (
                    <ToggleRow
                      key={item.flag}
                      compact
                      label={item.label}
                      description={item.description}
                      checked={has(draft.permissions, item.flag)}
                      disabled={!editable || !grantable(item.flag)}
                      onChange={(on) => toggle(item.flag, on)}
                    />
                  ))}
                </div>
              </section>
            ))}
            {!selected.isDefault && (
              <section className="space-y-1">
                <h4 className="text-[11px] font-semibold uppercase tracking-[0.1em] text-destructive">Danger</h4>
                <div className="overflow-hidden rounded-lg border border-destructive/40 bg-destructive/5">
                  <ToggleRow
                    label={administratorInfo.label}
                    description={administratorInfo.description}
                    checked={has(draft.permissions, Permission.Administrator)}
                    disabled={!editable || !grantable(Permission.Administrator)}
                    onChange={(on) => toggle(Permission.Administrator, on)}
                  />
                </div>
                {has(draft.permissions, Permission.Administrator) && (
                  <p className="flex items-start gap-1.5 text-[11px] text-destructive">
                    <ShieldAlert className="mt-px size-3.5 shrink-0" />
                    Everybody with this role can do anything in the server, except what only the owner can.
                  </p>
                )}
              </section>
            )}
          </div>
        )}

        {tab === 'members' && !selected.isDefault && (
          <div className="space-y-3">
            {editable && candidates.length > 0 && (
              <button
                type="button"
                className="inline-flex h-9 items-center gap-2 rounded-md border border-border px-3.5 text-sm font-medium transition-colors hover:bg-accent"
                onClick={() => {
                  setPicked([]);
                  setProblem('');
                  setAdding(true);
                }}
              >
                <UserPlus className="size-4" /> Add members
              </button>
            )}
            {members.length ? (
              <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-background/35">
                {members.map((member) => (
                  <li key={member.id} className="flex h-12 items-center gap-3 px-3 text-sm">
                    <Avatar
                      className="grid size-7 shrink-0 place-items-center rounded-full bg-secondary text-[10px] font-bold"
                      name={member.displayName}
                      imageId={member.avatarId}
                    />
                    <span className="min-w-0 flex-1 truncate">{member.displayName}</span>
                    {editable && (member.id === userId || access.isOwner || outranks(access, detail, member, userId)) && (
                      <button
                        type="button"
                        className="grid size-7 place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
                        aria-label={`Remove ${member.displayName} from ${selected.name}`}
                        disabled={busy}
                        onClick={() => setMemberRole(member.id, false)}
                      >
                        <X className="size-3.5" />
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-xs text-muted-foreground">
                Nobody holds this role yet.
              </p>
            )}
          </div>
        )}

        {tab !== 'members' && editable && (
          <div className="flex items-center gap-2 border-t border-border pt-3">
            <span className="min-w-0 flex-1 text-xs text-muted-foreground" role="status">
              {message || (dirty ? 'Changes you’ve made aren’t saved yet.' : '')}
            </span>
            {dirty && (
              <button
                type="button"
                className="inline-flex h-8 items-center rounded-md px-3 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground"
                onClick={() => setDraft(draftOf(selected))}
              >
                Reset
              </button>
            )}
            <button
              type="button"
              className={primaryClass}
              disabled={busy || !dirty || !draft.name.trim()}
              onClick={() =>
                void run(
                  () => api.request(`${base}/roles/${selected.id}`, 'PATCH', { ...draft, name: draft.name.trim() }),
                  'Role saved.',
                )
              }
            >
              Save role
            </button>
          </div>
        )}
        {tab === 'members' && message && (
          <p className="text-xs text-muted-foreground" role="status">
            {message}
          </p>
        )}
      </section>

      {creating && (
        <Modal title="Create role" onClose={() => setCreating(false)} contentClassName="w-[min(30rem,calc(100vw-2rem))]">
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              void create();
            }}
          >
            <label>
              Role name
              <input
                autoFocus
                required
                maxLength={32}
                placeholder="Moderator"
                value={fresh.name}
                onChange={(event) => setFresh({ ...fresh, name: event.target.value })}
              />
            </label>
            <div className="space-y-2">
              <ColourField
                label="Role colour"
                value={fresh.colour ?? '#99aab5'}
                onChange={(colour) => setFresh({ ...fresh, colour })}
              />
              {fresh.colour && (
                <button
                  type="button"
                  className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
                  onClick={() => setFresh({ ...fresh, colour: null })}
                >
                  <X className="size-3" /> No colour
                </button>
              )}
            </div>
            <div className="overflow-hidden rounded-lg border border-border bg-background/45">
              <ToggleRow
                label="Display separately"
                description="List its members under the role in the member list."
                checked={fresh.hoist}
                onChange={(hoist) => setFresh({ ...fresh, hoist })}
              />
            </div>
            <p className="text-[11px] text-muted-foreground">
              It starts below every other role and allowed nothing; its permissions open next.
            </p>
            {problem && (
              <p className="rounded-md bg-destructive/10 px-2 py-1 text-xs text-destructive" role="alert">
                {problem}
              </p>
            )}
            <div className="flex justify-end gap-2 border-t border-border pt-3">
              <button
                type="button"
                className="inline-flex h-9 items-center rounded-md px-4 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-foreground"
                onClick={() => setCreating(false)}
              >
                Cancel
              </button>
              <button className={cn(primaryClass, 'h-9 px-4 text-sm')} disabled={busy || !fresh.name.trim()}>
                Create role
              </button>
            </div>
          </form>
        </Modal>
      )}

      {adding && (
        <Modal
          title={`Add members to ${selected.name}`}
          onClose={() => setAdding(false)}
          contentClassName="w-[min(28rem,calc(100vw-2rem))]"
        >
          <div className="space-y-0.5" role="group" aria-label="People who can be given this role">
            {candidates.map((member) => (
              <label
                key={member.id}
                className="flex cursor-pointer flex-row items-center gap-3 rounded-md px-2 py-2 text-sm hover:bg-accent/50"
              >
                <input
                  type="checkbox"
                  className="accent-foreground"
                  checked={picked.includes(member.id)}
                  onChange={(event) =>
                    setPicked((current) =>
                      event.target.checked ? [...current, member.id] : current.filter((id) => id !== member.id),
                    )
                  }
                />
                <Avatar
                  className="grid size-7 shrink-0 place-items-center rounded-full bg-secondary text-[10px] font-bold"
                  name={member.displayName}
                  imageId={member.avatarId}
                />
                <span className="min-w-0 flex-1 truncate">{member.displayName}</span>
                <span className="truncate text-xs text-muted-foreground">@{member.username}</span>
              </label>
            ))}
          </div>
          {problem && (
            <p className="rounded-md bg-destructive/10 px-2 py-1 text-xs text-destructive" role="alert">
              {problem}
            </p>
          )}
          <div className="flex justify-end gap-2 border-t border-border pt-3">
            <button
              type="button"
              className="inline-flex h-9 items-center rounded-md px-4 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-foreground"
              onClick={() => setAdding(false)}
            >
              Cancel
            </button>
            <button
              type="button"
              className={cn(primaryClass, 'h-9 px-4 text-sm')}
              disabled={busy || picked.length === 0}
              onClick={() => void addPicked()}
            >
              {picked.length > 1 ? `Add ${picked.length} members` : 'Add'}
            </button>
          </div>
        </Modal>
      )}

      {confirmDelete && (
        <ConfirmDialog
          confirmation={{
            title: 'Delete role',
            description: `Delete ${selected.name}? Everybody holding it loses what it allowed, and tags that needed it come off.`,
            confirmLabel: 'Delete',
            tone: 'danger',
            action: async () => undefined,
          }}
          busy={busy}
          onCancel={() => setConfirmDelete(false)}
          onConfirm={() => {
            setConfirmDelete(false);
            void run(async () => {
              await api.request(`${base}/roles/${selected.id}`, 'DELETE');
              setSelectedId(ordered.find((role) => role.isDefault)?.id ?? '');
            });
          }}
        />
      )}
    </div>
  );
}
