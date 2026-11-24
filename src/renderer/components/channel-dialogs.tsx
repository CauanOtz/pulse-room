import { useState, type FormEvent, type ReactNode } from 'react';
import { FolderClosed, Hash, RefreshCw, ShieldCheck, SlidersHorizontal, Trash2, Volume2 } from 'lucide-react';
import type { CommunityChannel, CommunityDetail } from '../../shared/community';
import { channelPermissionsFor, Permission, type PermissionOverride } from '../../shared/permissions';
import { myAccess, shapeOf } from '../domain/access';
import type { CommunityClient } from '../infrastructure/community-client';
import { ConfirmDialog } from './confirm-dialog';
import { Modal } from './modal';
import { PanelDialog, PanelGroup, PanelHeading, PanelRow } from './ui/panel-dialog';
import { PermissionOverridesEditor } from './permission-overrides';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { cn } from './ui/utils';

const errorMessage = (error: unknown) => (error instanceof Error ? error.message : 'Something went wrong.');
const same = (a: PermissionOverride[], b: PermissionOverride[]) =>
  JSON.stringify([...a].filter((o) => o.allow || o.deny).sort(order)) ===
  JSON.stringify([...b].filter((o) => o.allow || o.deny).sort(order));
const order = (a: PermissionOverride, b: PermissionOverride) =>
  `${a.targetType}${a.targetId}`.localeCompare(`${b.targetType}${b.targetId}`);
const none = '__none__';

function CategorySelect({
  detail,
  value,
  onChange,
  bare,
}: {
  detail: CommunityDetail;
  value: string | null;
  onChange(value: string | null): void;
  /** Inside a panel row, which already names it. */
  bare?: boolean;
}) {
  const categories = detail.categories ?? [];
  if (!categories.length) return null;
  const select = (
    <Select value={value ?? none} onValueChange={(next) => onChange(next === none ? null : next)}>
      <SelectTrigger aria-label="Category">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={none}>No category</SelectItem>
        {categories.map((category) => (
          <SelectItem key={category.id} value={category.id}>
            {category.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
  if (bare) return select;
  return (
    <div className="compact-field">
      <span className="compact-field-label">Category</span>
      {select}
    </div>
  );
}

/**
 * Makes or changes a channel: its name and place on the Overview, and on the
 * Permissions tab who may see and do what in it.
 */
export function ChannelDialog({
  api,
  detail,
  userId,
  channel,
  type = 'voice',
  categoryId: initialCategory = null,
  onClose,
  onSaved,
}: {
  api: CommunityClient;
  detail: CommunityDetail;
  userId: string;
  channel?: CommunityChannel;
  /** Which group the plus was under, for a channel that does not exist yet. */
  type?: 'text' | 'voice';
  categoryId?: string | null;
  onClose(): void;
  onSaved(): Promise<void>;
}) {
  const access = myAccess(detail, userId);
  const [tab, setTab] = useState<'overview' | 'permissions'>('overview');
  const [name, setName] = useState(channel?.name ?? '');
  const [kind, setKind] = useState<'text' | 'voice'>(channel?.type ?? type);
  const [categoryId, setCategoryId] = useState<string | null>(channel?.categoryId ?? initialCategory);
  const [makePrivate, setMakePrivate] = useState(false);
  const saved = channel?.overrides ?? [];
  const [overrides, setOverrides] = useState<PermissionOverride[]>(saved);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const category = detail.categories?.find((entry) => entry.id === (channel?.categoryId ?? null));
  const everyone = detail.roles?.find((role) => role.isDefault);

  async function save(event?: FormEvent) {
    event?.preventDefault();
    if (!name.trim()) {
      setError('Give the channel a name.');
      setTab('overview');
      return;
    }
    setBusy(true);
    setError('');
    try {
      if (channel) {
        await api.request(`/api/channels/${channel.id}`, 'PATCH', { name, type: kind, categoryId });
        // Moving into a category syncs the channel with it; permissions edited
        // in the same save win over that, since they were the last word.
        if (!same(overrides, saved))
          await api.request(`/api/channels/${channel.id}/overrides`, 'PUT', { overrides });
      } else {
        const { id } = await api.request<{ id: string }>(
          `/api/servers/${detail.server.id}/channels`,
          'POST',
          {
            name,
            type: kind,
            categoryId,
          },
        );
        if (makePrivate && everyone) {
          // Private from the start: nobody sees it but whoever made it and the
          // people who see everything. The Permissions tab lets more in.
          const lock: PermissionOverride[] = [
            { targetType: 'role', targetId: everyone.id, allow: 0, deny: Permission.ViewChannels },
          ];
          if (!access.isAdministrator)
            lock.push({ targetType: 'member', targetId: userId, allow: Permission.ViewChannels, deny: 0 });
          await api.request(`/api/channels/${id}/overrides`, 'PUT', { overrides: lock });
        }
      }
      await onSaved();
      onClose();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError('');
    try {
      await action();
      await onSaved();
      onClose();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  const nameField = (
    <input
      id="channel-name"
      aria-label="Channel name"
      autoFocus
      required
      maxLength={60}
      placeholder={kind === 'voice' ? 'Late night call' : 'clips-and-chaos'}
      value={name}
      onChange={(e) => setName(e.target.value)}
    />
  );
  const typeChoice = (
    <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Channel type">
      <ChannelTypeChoice
        active={kind === 'text'}
        disabled={!!channel}
        icon={<Hash className="size-4" />}
        title="Text chat"
        description="Messages and files"
        onClick={() => setKind('text')}
      />
      <ChannelTypeChoice
        active={kind === 'voice'}
        disabled={!!channel}
        icon={<Volume2 className="size-4" />}
        title="Voice call"
        description="Voice and screen share"
        onClick={() => setKind('voice')}
      />
    </div>
  );
  const errorLine = error && (
    <p role="alert" className="form-error mt-4 rounded-xl px-3.5 py-2.5 text-xs text-destructive">
      {error}
    </p>
  );

  // A channel that does not exist yet is a small, quick question.
  if (!channel)
    return (
      <Modal
        title="Create channel"
        onClose={onClose}
        contentClassName="channel-editor-modal w-[min(30rem,calc(100vw-2rem))]"
      >
        <form className="compact-form" onSubmit={(e) => void save(e)}>
          <label>
            Channel name
            {nameField}
          </label>
          <div className="compact-field">
            <span className="compact-field-label">Channel type</span>
            {typeChoice}
          </div>
          <CategorySelect detail={detail} value={categoryId} onChange={setCategoryId} />
          <div className="compact-rows">
            <ToggleRow
              label="Private channel"
              description={
                categoryId
                  ? 'Only people you let in can see it. It stops following its category’s permissions.'
                  : 'Only people you let in can see it. Add them on its Permissions tab.'
              }
              checked={makePrivate}
              onChange={setMakePrivate}
            />
          </div>
          {errorLine}
          <footer className="compact-actions">
            <button type="button" className="compact-cancel" onClick={onClose}>
              Cancel
            </button>
            <button className="compact-primary" disabled={busy}>
              {busy ? 'Saving…' : 'Save channel'}
            </button>
          </footer>
        </form>
      </Modal>
    );

  const dirty =
    name !== channel.name || categoryId !== (channel.categoryId ?? null) || !same(overrides, saved);
  const custom = overrides.filter((override) => override.allow || override.deny).length;

  return (
    <PanelDialog<'overview' | 'permissions'>
      title="Edit channel"
      description={`${channel.type === 'text' ? '#' : ''}${channel.name}`}
      icon={channel.type === 'text' ? Hash : Volume2}
      className="channel-editor-panel"
      closeLabel="Close dialog"
      sections={[
        {
          id: 'overview',
          label: 'Overview',
          icon: SlidersHorizontal,
          status: `${channel.type === 'text' ? 'Text' : 'Voice'} · ${
            detail.categories?.find((entry) => entry.id === categoryId)?.name ?? 'No category'
          }`,
        },
        {
          id: 'permissions',
          label: 'Permissions',
          icon: ShieldCheck,
          status:
            category && channel.synced && same(overrides, saved)
              ? `Synced with ${category.name}`
              : custom === 1
                ? '1 rule of its own'
                : `${custom} rules of its own`,
        },
      ]}
      active={tab}
      onSelect={setTab}
      dirty={dirty}
      saving={busy}
      saveLabel="Save channel"
      onSave={() => void save()}
      onReset={() => {
        setName(channel.name);
        setCategoryId(channel.categoryId ?? null);
        setOverrides(saved);
        setError('');
      }}
      onClose={onClose}
    >
      {tab === 'overview' ? (
        <>
          <PanelHeading title="Overview" description="Its name, and where it sits in the list." />
          <PanelGroup>
            <PanelRow stacked label="Channel name" htmlFor="channel-name">
              {nameField}
            </PanelRow>
            <PanelRow stacked label="Channel type" detail="Set when the channel was made.">
              {typeChoice}
            </PanelRow>
            {(detail.categories?.length ?? 0) > 0 && (
              <PanelRow
                stacked
                label="Category"
                detail={
                  categoryId && categoryId !== (channel.categoryId ?? null)
                    ? 'Moving it into a category makes it follow that category’s permissions.'
                    : undefined
                }
              >
                <CategorySelect detail={detail} value={categoryId} onChange={setCategoryId} bare />
              </PanelRow>
            )}
          </PanelGroup>
          <PanelGroup title="Danger zone" className="panel-danger">
            <PanelRow
              label="Delete channel"
              detail="Everything said in it goes with it. This cannot be undone."
              control={
                <button type="button" className="panel-danger-button" onClick={() => setConfirmDelete(true)}>
                  <Trash2 className="size-3.5" /> Delete channel
                </button>
              }
            />
          </PanelGroup>
        </>
      ) : (
        <>
          <PanelHeading title="Permissions" description="Who may see and do what in this channel." />
          {category && (
            <div className="panel-callout">
              <span className="min-w-0" role="status">
                {channel.synced
                  ? `Permissions synced with ${category.name}. Changing anything here gives this channel permissions of its own.`
                  : `Permissions not synced with ${category.name}.`}
              </span>
              {!channel.synced && (
                <button
                  type="button"
                  className="panel-callout-action"
                  disabled={busy}
                  onClick={() => void run(() => api.request(`/api/channels/${channel.id}/sync`, 'POST'))}
                >
                  <RefreshCw className="size-3.5" /> Sync now
                </button>
              )}
            </div>
          )}
          <PermissionOverridesEditor
            detail={detail}
            userId={userId}
            access={access}
            actorPermissions={channel.permissions ?? access.permissions}
            scope={kind}
            overrides={overrides}
            onChange={setOverrides}
          />
        </>
      )}
      {errorLine}
      {confirmDelete && (
        <ConfirmDialog
          confirmation={{
            title: 'Delete channel',
            description: `Delete ${channel.type === 'text' ? '#' : ''}${channel.name} and everything said in it? This cannot be undone.`,
            confirmLabel: 'Delete',
            tone: 'danger',
            action: async () => undefined,
          }}
          busy={busy}
          onCancel={() => setConfirmDelete(false)}
          onConfirm={() => void run(() => api.request(`/api/channels/${channel.id}`, 'DELETE'))}
        />
      )}
    </PanelDialog>
  );
}

/**
 * A heading channels are gathered under. Its permissions are the ones every
 * channel inside follows until a channel is given its own.
 */
export function CategoryDialog({
  api,
  detail,
  userId,
  categoryId,
  onClose,
  onSaved,
}: {
  api: CommunityClient;
  detail: CommunityDetail;
  userId: string;
  categoryId?: string;
  onClose(): void;
  onSaved(): Promise<void>;
}) {
  const access = myAccess(detail, userId);
  const category = detail.categories?.find((entry) => entry.id === categoryId);
  const me = detail.members.find((member) => member.id === userId);
  const [tab, setTab] = useState<'overview' | 'permissions'>('overview');
  const [name, setName] = useState(category?.name ?? '');
  const saved = category?.overrides ?? [];
  const [overrides, setOverrides] = useState<PermissionOverride[]>(saved);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const synced = detail.channels.filter(
    (channel) => channel.categoryId === categoryId && channel.synced,
  ).length;

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError('');
    try {
      await action();
      await onSaved();
      onClose();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  const save = (event?: FormEvent) => {
    event?.preventDefault();
    if (!name.trim()) {
      setError('Give the category a name.');
      setTab('overview');
      return;
    }
    void run(async () => {
      if (category) {
        await api.request(`/api/categories/${category.id}`, 'PATCH', { name });
        if (!same(overrides, saved))
          await api.request(`/api/categories/${category.id}/overrides`, 'PUT', { overrides });
      } else {
        await api.request(`/api/servers/${detail.server.id}/categories`, 'POST', { name });
      }
    });
  };
  const nameField = (
    <input
      id="category-name"
      aria-label="Category name"
      autoFocus
      required
      maxLength={60}
      placeholder="STAFF"
      value={name}
      onChange={(e) => setName(e.target.value)}
    />
  );
  const errorLine = error && (
    <p role="alert" className="form-error mt-4 rounded-xl px-3.5 py-2.5 text-xs text-destructive">
      {error}
    </p>
  );

  if (!category)
    return (
      <Modal
        title="Create category"
        onClose={onClose}
        contentClassName="category-editor-modal w-[min(28rem,calc(100vw-2rem))]"
      >
        <form className="compact-form" onSubmit={save}>
          <label>
            Category name
            {nameField}
          </label>
          {errorLine}
          <footer className="compact-actions">
            <button type="button" className="compact-cancel" onClick={onClose}>
              Cancel
            </button>
            <button className="compact-primary" disabled={busy}>
              {busy ? 'Saving…' : 'Create category'}
            </button>
          </footer>
        </form>
      </Modal>
    );

  const dirty = name !== category.name || !same(overrides, saved);
  return (
    <PanelDialog<'overview' | 'permissions'>
      title="Edit category"
      description={category.name}
      icon={FolderClosed}
      className="category-editor-panel"
      closeLabel="Close dialog"
      sections={[
        { id: 'overview', label: 'Overview', icon: SlidersHorizontal, status: category.name },
        {
          id: 'permissions',
          label: 'Permissions',
          icon: ShieldCheck,
          status: synced === 1 ? '1 channel follows' : `${synced} channels follow`,
        },
      ]}
      active={tab}
      onSelect={setTab}
      dirty={dirty}
      saving={busy}
      saveLabel="Save category"
      onSave={() => save()}
      onReset={() => {
        setName(category.name);
        setOverrides(saved);
        setError('');
      }}
      onClose={onClose}
    >
      {tab === 'overview' ? (
        <>
          <PanelHeading title="Overview" description="A heading the channels below it are gathered under." />
          <PanelGroup>
            <PanelRow stacked label="Category name" htmlFor="category-name">
              {nameField}
            </PanelRow>
          </PanelGroup>
          <PanelGroup title="Danger zone" className="panel-danger">
            <PanelRow
              label="Delete category"
              detail="Its channels stay, keeping the permissions they have now."
              control={
                <button type="button" className="panel-danger-button" onClick={() => setConfirmDelete(true)}>
                  <Trash2 className="size-3.5" /> Delete category
                </button>
              }
            />
          </PanelGroup>
        </>
      ) : (
        <>
          <PanelHeading
            title="Permissions"
            description="What every channel inside follows, until a channel is given its own."
          />
          <p className="panel-note mb-4" role="status">
            {synced === 1
              ? '1 channel follows these permissions.'
              : `${synced} channels follow these permissions.`}
          </p>
          <PermissionOverridesEditor
            detail={detail}
            userId={userId}
            access={access}
            actorPermissions={
              me ? channelPermissionsFor(shapeOf(me), detail.roles ?? [], saved) : access.permissions
            }
            scope="category"
            overrides={overrides}
            onChange={setOverrides}
          />
        </>
      )}
      {errorLine}
      {confirmDelete && (
        <ConfirmDialog
          confirmation={{
            title: 'Delete category',
            description: `Delete ${category.name}? Its channels stay, keeping the permissions they have now.`,
            confirmLabel: 'Delete',
            tone: 'danger',
            action: async () => undefined,
          }}
          busy={busy}
          onCancel={() => setConfirmDelete(false)}
          onConfirm={() => void run(() => api.request(`/api/categories/${category.id}`, 'DELETE'))}
        />
      )}
    </PanelDialog>
  );
}

function ChannelTypeChoice({
  active,
  disabled,
  icon,
  title,
  description,
  onClick,
}: {
  active: boolean;
  disabled: boolean;
  icon: ReactNode;
  title: string;
  description: string;
  onClick(): void;
}) {
  return (
    <button
      className={`flex min-h-16 items-center gap-3 rounded-lg border px-3.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default ${
        active
          ? 'border-foreground/35 bg-accent text-foreground'
          : 'border-border bg-background/40 text-muted-foreground hover:border-foreground/20 hover:bg-accent/60 hover:text-foreground'
      }`}
      type="button"
      role="radio"
      aria-checked={active}
      disabled={disabled}
      onClick={onClick}
    >
      <span
        className={`grid size-8 shrink-0 place-items-center rounded-md ${active ? 'bg-primary text-primary-foreground' : 'bg-secondary text-foreground'}`}
      >
        {icon}
      </span>
      <span className="flex min-w-0 flex-col">
        <strong className="text-sm font-semibold">{title}</strong>
        <small className="text-[11px] text-muted-foreground">{description}</small>
      </span>
      <span
        className={`ml-auto size-3.5 rounded-full border ${active ? 'border-[4px] border-primary bg-primary-foreground' : 'border-input'}`}
        aria-hidden="true"
      />
    </button>
  );
}

export function ToggleRow({
  label,
  description,
  checked,
  onChange,
  compact = false,
  disabled,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange(checked: boolean): void;
  compact?: boolean;
  disabled?: boolean;
}) {
  return (
    <label
      className={cn(
        'permission-row check-row flex cursor-pointer flex-row items-center gap-4 px-4 transition-colors hover:bg-accent/45',
        compact ? 'py-2.5' : 'py-3.5',
        disabled && 'cursor-not-allowed opacity-50',
      )}
    >
      <span className="flex min-w-0 flex-1 flex-col">
        <strong className="truncate text-sm font-medium text-foreground">{label}</strong>
        {description && (
          <small className="mt-0.5 text-[11px] leading-4 text-muted-foreground">{description}</small>
        )}
      </span>
      <span className="relative h-5 w-9 shrink-0">
        <input
          className="peer absolute inset-0 z-10 size-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
          type="checkbox"
          aria-label={label}
          checked={checked}
          disabled={disabled}
          onChange={(event) => onChange(event.target.checked)}
        />
        <span
          className="absolute inset-0 rounded-full bg-input transition-colors peer-checked:bg-primary"
          aria-hidden="true"
        />
        <span
          className="absolute left-0.5 top-0.5 size-4 rounded-full bg-foreground shadow-sm transition-transform peer-checked:translate-x-4 peer-checked:bg-primary-foreground"
          aria-hidden="true"
        />
      </span>
    </label>
  );
}
