import { useEffect, useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  Crown,
  GripVertical,
  Lock,
  MoreHorizontal,
  Plus,
  Search,
  Trash2,
} from 'lucide-react';
import type { CommunityDetail, Role } from '../../shared/community';
import { Permission } from '../../shared/permissions';
import { canTouchRole, myAccess } from '../domain/access';
import type { CommunityClient } from '../infrastructure/community-client';
import { ConfirmDialog, type Confirmation } from './confirm-dialog';
import { Modal } from './modal';
import { RoleColourPicker, RoleMark } from './role-appearance';
import { RoleDetailsEditor } from './role-details-editor';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './ui/dropdown-menu';

interface Props {
  api: CommunityClient;
  detail: CommunityDetail;
  userId: string;
  onChanged(): Promise<void>;
  initialRoleId?: string;
  initialTab?: 'overview' | 'permissions' | 'members';
  onDirtyChange?(value: boolean): void;
  onBusyChange?(value: boolean): void;
}
const emptyRole = { name: '', description: '', colour: null as string | null, hoist: false };
const messageOf = (problem: unknown) =>
  problem instanceof Error ? problem.message : 'Something went wrong.';

export function RoleEditor({
  api,
  detail,
  userId,
  onChanged,
  initialRoleId,
  initialTab,
  onDirtyChange,
  onBusyChange,
}: Props) {
  const access = myAccess(detail, userId);
  const ordered = [...(detail.roles ?? [])].sort((a, b) => b.position - a.position);
  const [selectedId, setSelectedId] = useState<string | undefined>(
    initialRoleId ?? ordered.find((role) => !role.isDefault)?.id ?? ordered[0]?.id,
  );
  const selectedFromServer = ordered.find((role) => role.id === selectedId);
  const lastSelected = useRef(selectedFromServer);
  if (selectedFromServer) lastSelected.current = selectedFromServer;
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [resetVersion, setResetVersion] = useState(0);
  const selected = selectedFromServer ?? (dirty ? lastSelected.current : ordered[0]);
  const [query, setQuery] = useState('');
  const [listExpanded, setListExpanded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [dragging, setDragging] = useState<string>();
  const [dropTarget, setDropTarget] = useState<string>();
  const [confirmation, setConfirmation] = useState<Confirmation>();
  const [confirmBusy, setConfirmBusy] = useState(false);
  const [creating, setCreating] = useState(false);
  const [fresh, setFresh] = useState(emptyRole);
  const [createError, setCreateError] = useState('');
  const creatingDirty = creating && JSON.stringify(fresh) !== JSON.stringify(emptyRole);
  useEffect(() => {
    onDirtyChange?.(dirty || creatingDirty);
  }, [dirty, creatingDirty, onDirtyChange]);
  useEffect(() => {
    onBusyChange?.(busy || saving);
  }, [busy, saving, onBusyChange]);
  const working = busy || saving;
  const base = `/api/servers/${detail.server.id}`;
  const mayEdit = (role: Role) => access.can(Permission.ManageRoles) && canTouchRole(access, role);
  const cleanThen = (action: () => void) => {
    if (working) return;
    if (!dirty) {
      action();
      return;
    }
    setConfirmation({
      title: 'Discard role changes?',
      description: 'Your changes to this role have not been saved. Discard them to continue?',
      confirmLabel: 'Discard changes',
      action: async () => {
        setDirty(false);
        setResetVersion((value) => value + 1);
        action();
      },
    });
  };
  async function run(action: () => Promise<unknown>, done: string) {
    setBusy(true);
    setError('');
    setStatus('');
    try {
      await action();
      setStatus(done);
      await onChanged().catch(() => setStatus(`${done} Details will refresh when connected.`));
      return true;
    } catch (problem) {
      setError(messageOf(problem));
      return false;
    } finally {
      setBusy(false);
    }
  }
  const removable = ordered.filter((role) => !role.isDefault);
  const reorder = (ids: string[]) =>
    void run(
      () =>
        api.request(`${base}/roles`, 'PUT', {
          roleIds: ids,
          expectedOrder: removable.map((role) => role.id),
        }),
      'Role order saved.',
    );
  const move = (role: Role, offset: number) =>
    cleanThen(() => {
      const ids = removable.map((entry) => entry.id),
        from = ids.indexOf(role.id),
        to = from + offset;
      if (!mayEdit(role) || to < 0 || to >= ids.length || !mayEdit(removable[to])) return;
      [ids[from], ids[to]] = [ids[to], ids[from]];
      reorder(ids);
    });
  const deleteRole = (role: Role) =>
    cleanThen(() =>
      setConfirmation({
        title: `Delete ${role.name}?`,
        description:
          'This removes the role from every member and its channel overrides. This cannot be undone.',
        confirmLabel: 'Delete role',
        tone: 'danger',
        action: async () => {
          if (await run(() => api.request(`${base}/roles/${role.id}`, 'DELETE'), 'Role deleted.')) {
            if (selectedId === role.id) {
              setSelectedId(ordered.find((entry) => entry.id !== role.id)?.id);
              setResetVersion((value) => value + 1);
            }
          }
        },
      }),
    );
  const openCreate = () =>
    cleanThen(() => {
      setFresh(emptyRole);
      setCreateError('');
      setCreating(true);
    });
  const closeCreate = () => {
    if (busy) return;
    if (!creatingDirty) {
      setCreating(false);
      return;
    }
    setConfirmation({
      title: 'Discard new role?',
      description: 'This role has not been created. Discard the details you entered?',
      confirmLabel: 'Discard',
      action: async () => setCreating(false),
    });
  };
  const roleMenu = (role: Role, header = false) => {
    if (!mayEdit(role) || role.isDefault) return null;
    const index = removable.findIndex((entry) => entry.id === role.id);
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className={header ? 'role-secondary-button role-header-menu' : 'role-icon-button role-list-menu'}
            aria-label={`Actions for role ${role.name}`}
            disabled={working}
          >
            <MoreHorizontal size={20} />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            disabled={index <= 0 || !mayEdit(removable[index - 1])}
            onSelect={() => move(role, -1)}
          >
            <ArrowUp size={15} />
            Move {role.name} up
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={index >= removable.length - 1 || !mayEdit(removable[index + 1])}
            onSelect={() => move(role, 1)}
          >
            <ArrowDown size={15} />
            Move {role.name} down
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem className="text-destructive" onSelect={() => deleteRole(role)}>
            <Trash2 size={15} />
            Delete {role.name}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  };
  return (
    <div className="role-editor roles-workspace">
      <header className="roles-page-heading">
        <div>
          <h2>Roles</h2>
          <p>Control what members can do in this server.</p>
        </div>
        <label className="role-search">
          <Search size={18} />
          <input
            aria-label="Search roles"
            placeholder="Search roles…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <button
          type="button"
          className="role-primary-button"
          disabled={working || !access.can(Permission.ManageRoles)}
          onClick={openCreate}
        >
          <Plus size={17} />
          Create role
        </button>
      </header>
      <div className="roles-workspace-columns">
        <aside
          className={`roles-list-panel ${listExpanded || query ? 'is-expanded' : ''}`}
          aria-label="Server roles"
        >
          <header>
            <h3>
              Roles <span>{ordered.length}</span>
            </h3>
            <button
              type="button"
              className="role-list-disclosure"
              aria-label="Choose a role"
              aria-expanded={listExpanded || Boolean(query)}
              aria-controls="server-role-list"
              onClick={() => setListExpanded((value) => !value)}
            >
              <span>{selected?.name ?? 'Choose a role'}</span>
              <ChevronDown size={15} />
            </button>
            <button
              type="button"
              className="role-icon-button"
              aria-label="Create another role"
              disabled={working || !access.can(Permission.ManageRoles)}
              onClick={openCreate}
            >
              <Plus size={19} />
            </button>
          </header>
          {!query && (
            <div
              className="role-owner-status"
              aria-label="Server ownership is separate from configurable roles"
            >
              <span className="role-owner-mark">
                <Crown size={17} />
              </span>
              <div>
                <strong>
                  Owner <Crown size={13} />
                </strong>
                <small>
                  {detail.members.filter((member) => member.role === 'owner').length} member · protected
                  status
                </small>
              </div>
              <Lock size={12} />
            </div>
          )}
          <ol id="server-role-list" aria-label="Roles, highest first">
            {ordered
              .filter((role) => role.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))
              .map((role) => {
                const draggable = !role.isDefault && mayEdit(role) && !working;
                const count = role.isDefault
                  ? detail.members.length
                  : detail.members.filter((member) => member.roleIds?.includes(role.id)).length;
                return (
                  <li
                    key={role.id}
                    className={`role-row ${role.id === selected?.id ? 'is-selected' : ''} ${dragging === role.id ? 'is-dragging' : ''} ${dropTarget === role.id ? 'is-drop-target' : ''}`}
                    draggable={draggable}
                    onDragStart={(event) => {
                      if (dirty) {
                        event.preventDefault();
                        setError('Save or discard your changes before reordering roles.');
                        return;
                      }
                      event.dataTransfer.setData('text/plain', role.id);
                      event.dataTransfer.effectAllowed = 'move';
                      setDragging(role.id);
                    }}
                    onDragEnd={() => {
                      setDragging(undefined);
                      setDropTarget(undefined);
                    }}
                    onDragOver={(event) => {
                      if (draggable && dragging && dragging !== role.id) {
                        event.preventDefault();
                        setDropTarget(role.id);
                      }
                    }}
                    onDragLeave={() => setDropTarget(undefined)}
                    onDrop={(event) => {
                      event.preventDefault();
                      if (!draggable || !dragging || dragging === role.id) return;
                      const ids = removable.map((entry) => entry.id).filter((id) => id !== dragging);
                      ids.splice(ids.indexOf(role.id), 0, dragging);
                      setDragging(undefined);
                      setDropTarget(undefined);
                      reorder(ids);
                    }}
                  >
                    <button
                      type="button"
                      className="role-drag-handle"
                      aria-label={`Reorder ${role.name}`}
                      title="Drag, or use Alt + Arrow up/down"
                      disabled={!draggable}
                      onKeyDown={(event) => {
                        if (event.altKey && ['ArrowUp', 'ArrowDown'].includes(event.key)) {
                          event.preventDefault();
                          move(role, event.key === 'ArrowUp' ? -1 : 1);
                        }
                      }}
                    >
                      <GripVertical size={17} />
                    </button>
                    <button
                      type="button"
                      className="role-list-select"
                      aria-label={`Select role ${role.name}`}
                      aria-pressed={selected?.id === role.id}
                      disabled={working}
                      onClick={() =>
                        cleanThen(() => {
                          setSelectedId(role.id);
                          setListExpanded(false);
                          setError('');
                          setStatus('');
                        })
                      }
                    >
                      <RoleMark role={role} />
                      <span>
                        <strong>{role.name}</strong>
                        <small>
                          {count} {count === 1 ? 'member' : 'members'}
                        </small>
                      </span>
                      {!mayEdit(role) && <Lock size={13} />}
                    </button>
                    {roleMenu(role)}
                  </li>
                );
              })}
          </ol>
          {!ordered.some((role) =>
            role.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()),
          ) && <p className="role-empty-caption">No roles match “{query}”.</p>}
        </aside>
        {selected ? (
          <RoleDetailsEditor
            key={`${selected.id}:${resetVersion}`}
            api={api}
            detail={detail}
            role={selected}
            userId={userId}
            editable={Boolean(selectedFromServer) && mayEdit(selected)}
            busy={busy}
            initialTab={initialTab === 'members' ? 'members' : 'permissions'}
            onChanged={onChanged}
            onDirtyChange={setDirty}
            onBusyChange={setSaving}
            onDelete={() => deleteRole(selected)}
            onMove={(offset) => move(selected, offset)}
            menu={roleMenu(selected, true)}
          />
        ) : (
          <div className="role-empty-state">No roles are available.</div>
        )}
      </div>
      {error && (
        <p className="roles-operation-error" role="alert">
          {error}
        </p>
      )}
      {status && (
        <p className="roles-operation-status" role="status">
          {status}
        </p>
      )}
      {creating && (
        <Modal title="Create role" onClose={closeCreate} contentClassName="role-create-modal">
          <form
            className="role-create-form"
            onSubmit={(event) => {
              event.preventDefault();
              if (busy || !fresh.name.trim()) return;
              setBusy(true);
              setCreateError('');
              void api
                .request<{ id: string }>(`${base}/roles`, 'POST', {
                  ...fresh,
                  name: fresh.name.trim(),
                  permissions: 0,
                })
                .then(async ({ id }) => {
                  setSelectedId(id);
                  setCreating(false);
                  setResetVersion((value) => value + 1);
                  await onChanged().catch(() =>
                    setStatus('Role created. Details will refresh when connected.'),
                  );
                })
                .catch((problem) => setCreateError(messageOf(problem)))
                .finally(() => setBusy(false));
            }}
          >
            <label>
              Role name
              <input
                aria-label="Role name"
                maxLength={32}
                required
                autoFocus
                value={fresh.name}
                disabled={busy}
                onChange={(event) => setFresh({ ...fresh, name: event.target.value })}
              />
            </label>
            <label>
              Description (optional)
              <textarea
                maxLength={200}
                value={fresh.description}
                disabled={busy}
                onChange={(event) => setFresh({ ...fresh, description: event.target.value })}
              />
            </label>
            <div>
              <span className="role-field-label">Role color</span>
              <RoleColourPicker
                value={fresh.colour}
                disabled={busy}
                onChange={(colour) => setFresh({ ...fresh, colour })}
              />
            </div>
            <label className="role-create-hoist">
              <input
                type="checkbox"
                checked={fresh.hoist}
                disabled={busy}
                onChange={(event) => setFresh({ ...fresh, hoist: event.target.checked })}
              />
              Display separately
            </label>
            {createError && (
              <p className="role-error" role="alert">
                {createError}
              </p>
            )}
            <footer>
              <button type="button" className="role-secondary-button" disabled={busy} onClick={closeCreate}>
                Cancel
              </button>
              <button type="submit" className="role-primary-button" disabled={busy || !fresh.name.trim()}>
                {busy ? 'Creating…' : 'Create role'}
              </button>
            </footer>
          </form>
        </Modal>
      )}
      {confirmation && (
        <ConfirmDialog
          confirmation={confirmation}
          busy={confirmBusy}
          onCancel={() => !confirmBusy && setConfirmation(undefined)}
          onConfirm={() => {
            setConfirmBusy(true);
            void confirmation
              .action()
              .catch((problem) => setError(messageOf(problem)))
              .finally(() => {
                setConfirmBusy(false);
                setConfirmation((current) => (current === confirmation ? undefined : current));
              });
          }}
        />
      )}
    </div>
  );
}
