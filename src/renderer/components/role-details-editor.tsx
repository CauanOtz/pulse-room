import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  ArrowDown,
  ArrowUp,
  Check,
  ImagePlus,
  LoaderCircle,
  Lock,
  Pencil,
  ShieldAlert,
  Trash2,
} from 'lucide-react';
import type { CommunityDetail, Role } from '../../shared/community';
import { has, Permission } from '../../shared/permissions';
import { myAccess } from '../domain/access';
import { ApiError, type CommunityClient } from '../infrastructure/community-client';
import { acceptedTypes } from '../infrastructure/prepare-image';
import { Avatar } from './avatar';
import { ConfirmDialog, type Confirmation } from './confirm-dialog';
import { ImageCropDialog } from './image-crop-dialog';
import { RoleColourPicker, RolePortrait } from './role-appearance';
import { RoleMembers } from './role-members';
import { RolePermissions } from './role-permissions';
import { Switch } from './ui/switch';

interface Draft {
  name: string;
  description: string;
  colour: string | null;
  permissions: number;
  hoist: boolean;
  iconId: string | null;
  iconBlob?: Blob;
  iconUrl?: string;
}
const draftOf = (role: Role): Draft => ({
  name: role.name,
  description: role.description ?? '',
  colour: role.colour,
  permissions: role.permissions,
  hoist: role.hoist,
  iconId: role.iconId ?? null,
});
const critical =
  Permission.Administrator |
  Permission.ManageRoles |
  Permission.ManageServer |
  Permission.BanMembers |
  Permission.KickMembers;
type Tab = 'permissions' | 'members' | 'settings';

export function RoleDetailsEditor({
  api,
  detail,
  role,
  userId,
  editable,
  busy,
  initialTab,
  onChanged,
  onDirtyChange,
  onBusyChange,
  onDelete,
  onMove,
  menu,
}: {
  api: CommunityClient;
  detail: CommunityDetail;
  role: Role;
  userId: string;
  editable: boolean;
  busy: boolean;
  initialTab: Tab;
  onChanged(): Promise<void>;
  onDirtyChange(value: boolean): void;
  onBusyChange(value: boolean): void;
  onDelete(): void;
  onMove(offset: number): void;
  menu: ReactNode;
}) {
  const [saved, setSaved] = useState(role);
  const [draft, setDraft] = useState(() => draftOf(role));
  const [tab, setTab] = useState<Tab>(initialTab);
  const [category, setCategory] = useState('general');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [conflicted, setConflicted] = useState(false);
  const [confirmation, setConfirmation] = useState<Confirmation>();
  const [file, setFile] = useState<File>();
  const input = useRef<HTMLInputElement>(null);
  const nameField = useRef<HTMLInputElement>(null);
  const localUrls = useRef(new Set<string>());
  const uploads = useRef(new WeakMap<Blob, string>());
  const dirty = JSON.stringify(draft) !== JSON.stringify(draftOf(saved));
  const access = myAccess(detail, userId);
  const grantable = (flag: number) => access.isAdministrator || has(access.permissions, flag);
  const remoteKey = JSON.stringify(role);
  const acceptedRemote = useRef(remoteKey);
  useEffect(() => {
    if (!dirty && !saving && acceptedRemote.current !== remoteKey) {
      setSaved(role);
      setDraft(draftOf(role));
      acceptedRemote.current = remoteKey;
      setConflicted(false);
    }
  }, [remoteKey, dirty, saving]);
  useEffect(() => {
    onDirtyChange(dirty);
  }, [dirty, onDirtyChange]);
  useEffect(() => {
    onBusyChange(saving);
    return () => onBusyChange(false);
  }, [saving, onBusyChange]);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (dirty || saving) {
        event.preventDefault();
        event.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty, saving]);
  useEffect(
    () => () => {
      for (const url of localUrls.current) URL.revokeObjectURL(url);
    },
    [],
  );
  const change = <K extends keyof Draft>(key: K, value: Draft[K]) => {
    setDraft((current) => ({ ...current, [key]: value }));
    setStatus('');
    setError('');
  };
  const members = detail.members.filter((member) => role.isDefault || member.roleIds?.includes(role.id));
  const base = `/api/servers/${detail.server.id}/roles/${role.id}`;
  const locked = busy || saving || !editable;
  const remoteChanged = dirty && saved.revision !== role.revision;
  const toggle = (flag: number, on: boolean) => {
    if (!editable || !grantable(flag)) return;
    const apply = () => change('permissions', on ? draft.permissions | flag : draft.permissions & ~flag);
    if (on && flag === Permission.Administrator)
      setConfirmation({
        title: 'Grant Administrator?',
        description:
          'Every member with this role will receive all permissions and bypass channel restrictions after you save.',
        confirmLabel: 'Grant Administrator',
        action: async () => apply(),
      });
    else apply();
  };
  const selectAll = (flags: number[]) => {
    const allowed = flags.filter((flag) => grantable(flag));
    const mask = allowed.reduce((value, flag) => value | flag, 0);
    const apply = () => change('permissions', draft.permissions | mask);
    if (mask & ~draft.permissions & critical)
      setConfirmation({
        title: 'Grant these permissions?',
        description:
          'This selection includes permissions that can manage the server or moderate members. They will take effect when you save.',
        confirmLabel: 'Select permissions',
        action: async () => apply(),
      });
    else apply();
  };
  const reset = () => {
    setSaved(role);
    setDraft(draftOf(role));
    acceptedRemote.current = remoteKey;
    setError('');
    setStatus('');
    setConflicted(false);
  };
  function keepChanges() {
    const original = draftOf(saved),
      latest = draftOf(role),
      next = { ...latest };
    for (const key of ['name', 'description', 'colour', 'hoist', 'iconId'] as const)
      if (draft[key] !== original[key]) Object.assign(next, { [key]: draft[key] });
    const changedBits = draft.permissions ^ original.permissions;
    next.permissions = (latest.permissions & ~changedBits) | (draft.permissions & changedBits);
    if (draft.iconBlob) {
      next.iconBlob = draft.iconBlob;
      next.iconUrl = draft.iconUrl;
    }
    setSaved(role);
    setDraft(next);
    acceptedRemote.current = remoteKey;
    setConflicted(false);
    setError('');
  }
  async function save() {
    if (locked || !dirty || !draft.name.trim()) return;
    setSaving(true);
    setError('');
    setStatus('');
    try {
      let iconId = draft.iconId;
      if (draft.iconBlob) {
        iconId =
          uploads.current.get(draft.iconBlob) ??
          (await api.upload<{ imageId: string }>(`${base}/icon`, draft.iconBlob)).imageId;
        uploads.current.set(draft.iconBlob, iconId);
      }
      const next = {
        ...draftOf(saved),
        ...draft,
        name: draft.name.trim(),
        iconId,
        iconBlob: undefined,
        iconUrl: undefined,
      };
      const patch: Record<string, unknown> = { expectedRevision: saved.revision };
      for (const key of ['name', 'description', 'colour', 'permissions', 'hoist', 'iconId'] as const)
        if (next[key] !== draftOf(saved)[key]) patch[key] = next[key];
      if (Object.keys(patch).length === 1) {
        reset();
        return;
      }
      await api.request(base, 'PATCH', patch);
      const savedRole = { ...saved, ...next, revision: (saved.revision ?? 1) + 1 };
      setSaved(savedRole);
      setDraft(draftOf(savedRole));
      setConflicted(false);
      setStatus('Role saved.');
      await onChanged().catch(() => setStatus('Role saved. Details will refresh when connected.'));
    } catch (problem) {
      if (problem instanceof ApiError && problem.status === 409) {
        setConflicted(true);
        await onChanged().catch(() => undefined);
      }
      if (problem instanceof ApiError && problem.status === 422) uploads.current = new WeakMap();
      setError(problem instanceof Error ? problem.message : 'Could not save this role.');
    } finally {
      setSaving(false);
    }
  }
  const sameOrdinal = [...(detail.roles ?? [])]
    .filter((entry) => !entry.isDefault)
    .sort((a, b) => b.position - a.position);
  const orderIndex = sameOrdinal.findIndex((entry) => entry.id === role.id);
  const canMoveTo = (index: number) =>
    index >= 0 && index < sameOrdinal.length && (access.isOwner || sameOrdinal[index].position < access.rank);

  return (
    <section className="role-details-panel" aria-label={`Role ${role.name}`}>
      <header className="role-details-heading">
        <RolePortrait
          role={{ ...role, name: draft.name, colour: draft.colour, iconId: draft.iconId }}
          localUrl={draft.iconUrl}
          large
        />
        <div>
          <h3>{draft.name || role.name}</h3>
          <p>
            {role.isDefault ? 'Everyone in this server' : 'Role'} · {members.length}{' '}
            {members.length === 1 ? 'member' : 'members'}
          </p>
        </div>
        <button
          type="button"
          className="role-secondary-button role-edit-button"
          disabled={locked || role.isDefault}
          onClick={() => {
            nameField.current?.scrollIntoView({ block: 'center', behavior: 'auto' });
            nameField.current?.focus();
            nameField.current?.select();
          }}
        >
          <Pencil size={16} />
          Edit role
        </button>
        {menu}
      </header>
      {!editable && (
        <p className="role-locked-notice">
          <Lock size={15} />
          This role is protected by the hierarchy. You can view it, but cannot change it.
        </p>
      )}
      {(remoteChanged || conflicted) && (
        <div className="role-conflict-notice" role="alert">
          <strong>This role changed elsewhere.</strong>
          <p>
            Your edits are preserved. Load the latest version or reapply only the fields and permission bits
            you changed.
          </p>
          <button
            type="button"
            className="role-secondary-button"
            disabled={saving}
            onClick={() =>
              setConfirmation({
                title: 'Load the latest role?',
                description: 'This discards your local edits and loads the saved role.',
                confirmLabel: 'Load latest',
                action: async () => reset(),
              })
            }
          >
            Load latest
          </button>
          <button type="button" className="role-secondary-button" disabled={saving} onClick={keepChanges}>
            Keep my changes
          </button>
        </div>
      )}
      <fieldset className="role-personalization" disabled={locked}>
        <div className="role-color-icon-row">
          <div>
            <span className="role-field-label">Role color</span>
            <RoleColourPicker
              value={draft.colour}
              disabled={locked || role.isDefault}
              onChange={(value) => change('colour', value)}
            />
          </div>
          <div className="role-icon-field">
            <span className="role-field-label">Role icon</span>
            <div>
              <span className="role-icon-upload-preview">
                {draft.iconUrl ? (
                  <img src={draft.iconUrl} alt="Role icon preview" />
                ) : draft.iconId ? (
                  <Avatar name={draft.name} imageId={draft.iconId} className="role-icon-upload-image" />
                ) : (
                  <ImagePlus size={20} />
                )}
              </span>
              <div>
                <button
                  type="button"
                  className="role-secondary-button"
                  disabled={locked || role.isDefault}
                  onClick={() => input.current?.click()}
                >
                  {draft.iconId || draft.iconBlob ? 'Change icon' : 'Add icon'}
                </button>
                <small>PNG, JPEG, WebP or GIF · Max 2 MB</small>
                {(draft.iconId || draft.iconBlob) && (
                  <button
                    className="role-remove-icon"
                    type="button"
                    onClick={() => {
                      setDraft((current) => ({
                        ...current,
                        iconId: null,
                        iconBlob: undefined,
                        iconUrl: undefined,
                      }));
                      setError('');
                    }}
                  >
                    Remove icon
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
        <label className="role-counted-field">
          Role name
          <span>
            <input
              ref={nameField}
              aria-label="Role name"
              disabled={locked || role.isDefault}
              required
              maxLength={32}
              value={draft.name}
              onChange={(event) => change('name', event.target.value)}
            />
            <small aria-hidden="true">{draft.name.length}/32</small>
          </span>
        </label>
        <label className="role-counted-field">
          Role description
          <span>
            <textarea
              aria-label="Role description"
              rows={2}
              maxLength={200}
              disabled={locked || role.isDefault}
              placeholder={
                role.isDefault
                  ? 'The base permissions every member holds.'
                  : 'Describe what this role is for.'
              }
              value={draft.description}
              onChange={(event) => change('description', event.target.value)}
            />
            <small aria-hidden="true">{draft.description.length}/200</small>
          </span>
        </label>
      </fieldset>
      <div className="role-editor-tabs" role="tablist" aria-label="Role editor sections">
        {(['permissions', 'members', 'settings'] as const).map((id) => (
          <button
            key={id}
            role="tab"
            type="button"
            id={`role-tab-${id}`}
            aria-selected={tab === id}
            aria-controls={`role-panel-${id}`}
            tabIndex={tab === id ? 0 : -1}
            onClick={() => setTab(id)}
            onKeyDown={(event) => {
              const ids: Tab[] = ['permissions', 'members', 'settings'];
              const index = ids.indexOf(tab);
              const target =
                event.key === 'ArrowRight'
                  ? ids[(index + 1) % 3]
                  : event.key === 'ArrowLeft'
                    ? ids[(index + 2) % 3]
                    : event.key === 'Home'
                      ? ids[0]
                      : event.key === 'End'
                        ? ids[2]
                        : undefined;
              if (target) {
                event.preventDefault();
                setTab(target);
                document.getElementById(`role-tab-${target}`)?.focus();
              }
            }}
          >
            {id[0].toUpperCase() + id.slice(1)}
            {id === 'members' && <span>{members.length}</span>}
          </button>
        ))}
      </div>
      <div
        className="role-tab-panel"
        role="tabpanel"
        id={`role-panel-${tab}`}
        aria-labelledby={`role-tab-${tab}`}
      >
        {tab === 'permissions' && (
          <RolePermissions
            role={role}
            roles={detail.roles ?? []}
            value={draft.permissions}
            category={category}
            onCategory={setCategory}
            editable={editable}
            grantable={grantable}
            busy={busy || saving}
            onToggle={toggle}
            onSelectAll={selectAll}
          />
        )}
        {tab === 'members' && (
          <RoleMembers
            detail={detail}
            role={role}
            userId={userId}
            editable={editable}
            busy={busy || saving}
            operationError={error}
            onChange={async (add, remove) => {
              setSaving(true);
              setError('');
              try {
                await api.request(`${base}/members`, 'PATCH', { addUserIds: add, removeUserIds: remove });
                setStatus(add.length ? 'Members added.' : 'Member removed.');
                await onChanged().catch(() =>
                  setStatus('Role members updated. Details will refresh when connected.'),
                );
                return true;
              } catch (problem) {
                setError(problem instanceof Error ? problem.message : 'Could not update role members.');
                return false;
              } finally {
                setSaving(false);
              }
            }}
          />
        )}
        {tab === 'settings' && (
          <div className="role-settings-workspace">
            <section>
              <header>
                <h4>Display & organization</h4>
                <p>Choose how this role appears in the member list.</p>
              </header>
              <div className="role-setting-switch">
                <label htmlFor="role-hoist">
                  <strong>Display role separately</strong>
                  <small>Group members under their highest displayed role in the sidebar.</small>
                </label>
                <Switch
                  id="role-hoist"
                  aria-label="Display separately"
                  checked={draft.hoist}
                  disabled={locked || role.isDefault}
                  onCheckedChange={(on) => change('hoist', on)}
                />
              </div>
            </section>
            <section>
              <header>
                <h4>Role hierarchy</h4>
                <p>
                  {role.isDefault
                    ? '@everyone is the base role. It cannot be moved or deleted.'
                    : `Position ${role.position} of ${sameOrdinal.length}. Members can only manage roles below their own.`}
                </p>
              </header>
              {!role.isDefault && (
                <div className="role-hierarchy-actions">
                  <button
                    type="button"
                    className="role-secondary-button"
                    disabled={locked || !canMoveTo(orderIndex - 1)}
                    onClick={() => onMove(-1)}
                  >
                    <ArrowUp size={15} />
                    Move up
                  </button>
                  <button
                    type="button"
                    className="role-secondary-button"
                    disabled={locked || !canMoveTo(orderIndex + 1)}
                    onClick={() => onMove(1)}
                  >
                    <ArrowDown size={15} />
                    Move down
                  </button>
                </div>
              )}
            </section>
            {!role.isDefault && editable && (
              <section className="role-danger-zone">
                <div>
                  <h4>Delete role</h4>
                  <p>Remove this role and its assignments. This cannot be undone.</p>
                </div>
                <button
                  type="button"
                  className="role-delete-button"
                  disabled={busy || saving}
                  onClick={onDelete}
                >
                  <Trash2 size={16} />
                  Delete role
                </button>
              </section>
            )}
          </div>
        )}
      </div>
      {has(draft.permissions, Permission.Administrator) && (
        <p className="role-admin-warning">
          <ShieldAlert size={17} />
          Administrator grants every permission and bypasses channel restrictions. The server owner remains
          protected.
        </p>
      )}
      {error && (
        <p className="role-error" role="alert">
          {error}
        </p>
      )}
      {status && (
        <p className="role-save-status" role="status">
          <Check size={14} />
          {status}
        </p>
      )}
      {dirty && (
        <div className="role-unsaved-bar" role="region" aria-label="Unsaved role changes">
          <span>{saving ? 'Saving your changes…' : 'You have unsaved changes.'}</span>
          <button type="button" className="role-discard-button" disabled={saving || busy} onClick={reset}>
            Discard
          </button>
          <button
            type="button"
            className="role-primary-button"
            disabled={locked || !draft.name.trim() || remoteChanged || conflicted}
            onClick={() => void save()}
          >
            {saving && <LoaderCircle size={14} className="animate-spin" />}
            {saving ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      )}
      <input
        ref={input}
        type="file"
        className="hidden"
        aria-label="Role icon file"
        accept={acceptedTypes.join(',')}
        onChange={(event) => {
          const source = event.target.files?.[0];
          event.target.value = '';
          if (!source) return;
          if (source.size > 2_097_152) {
            setError('Choose an icon smaller than 2 MB.');
            return;
          }
          setFile(source);
        }}
      />
      {file && (
        <ImageCropDialog
          file={file}
          title="Role icon"
          kind="icon"
          onClose={() => setFile(undefined)}
          onSave={async (blob) => {
            if (blob.size > 2_097_152) throw new Error('Choose an icon smaller than 2 MB.');
            const url = URL.createObjectURL(blob);
            localUrls.current.add(url);
            setDraft((current) => ({ ...current, iconId: null, iconBlob: blob, iconUrl: url }));
            setFile(undefined);
            setError('');
          }}
        />
      )}
      {confirmation && (
        <ConfirmDialog
          confirmation={confirmation}
          onCancel={() => setConfirmation(undefined)}
          onConfirm={() => {
            void confirmation.action().finally(() => setConfirmation(undefined));
          }}
        />
      )}
    </section>
  );
}
