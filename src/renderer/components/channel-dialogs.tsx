import { useState, type FormEvent, type ReactNode } from 'react';
import { Hash, RefreshCw, Trash2, Volume2 } from 'lucide-react';
import type { CommunityChannel, CommunityDetail } from '../../shared/community';
import { channelPermissionsFor, Permission, type PermissionOverride } from '../../shared/permissions';
import { myAccess, shapeOf } from '../domain/access';
import type { CommunityClient } from '../infrastructure/community-client';
import { ConfirmDialog } from './confirm-dialog';
import { Modal } from './modal';
import { PermissionOverridesEditor } from './permission-overrides';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { cn } from './ui/utils';

const errorMessage = (error: unknown) => (error instanceof Error ? error.message : 'Something went wrong.');
const primaryClass =
  'primary-action inline-flex h-9 items-center justify-center rounded-md bg-primary px-5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50';
const same = (a: PermissionOverride[], b: PermissionOverride[]) =>
  JSON.stringify([...a].filter((o) => o.allow || o.deny).sort(order)) ===
  JSON.stringify([...b].filter((o) => o.allow || o.deny).sort(order));
const order = (a: PermissionOverride, b: PermissionOverride) =>
  `${a.targetType}${a.targetId}`.localeCompare(`${b.targetType}${b.targetId}`);
const none = '__none__';

function Tabs<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { id: T; label: string }[];
  onChange(value: T): void;
}) {
  return (
    <div className="flex gap-1 border-b border-border px-6" role="tablist">
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          role="tab"
          aria-selected={value === option.id}
          className={cn(
            '-mb-px border-b-2 px-2.5 py-2.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            value === option.id
              ? 'border-foreground text-foreground'
              : 'border-transparent text-muted-foreground hover:text-foreground',
          )}
          onClick={() => onChange(option.id)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function CategorySelect({
  detail,
  value,
  onChange,
}: {
  detail: CommunityDetail;
  value: string | null;
  onChange(value: string | null): void;
}) {
  const categories = detail.categories ?? [];
  if (!categories.length) return null;
  return (
    <div className="flex flex-col gap-1.5 text-xs font-medium text-muted-foreground">
      <span id="channel-category">Category</span>
      <Select value={value ?? none} onValueChange={(next) => onChange(next === none ? null : next)}>
        <SelectTrigger aria-labelledby="channel-category">
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

  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      if (channel) {
        await api.request(`/api/channels/${channel.id}`, 'PATCH', { name, type: kind, categoryId });
        // Moving into a category syncs the channel with it; permissions edited
        // in the same save win over that, since they were the last word.
        if (!same(overrides, saved)) await api.request(`/api/channels/${channel.id}/overrides`, 'PUT', { overrides });
      } else {
        const { id } = await api.request<{ id: string }>(`/api/servers/${detail.server.id}/channels`, 'POST', {
          name,
          type: kind,
          categoryId,
        });
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

  return (
    <Modal
      title={channel ? 'Edit channel' : 'Create channel'}
      onClose={onClose}
      contentClassName={cn(
        'channel-editor-modal',
        channel ? 'h-[min(40rem,calc(100vh-2rem))] max-h-none w-[min(52rem,calc(100vw-2rem))]' : 'w-[min(38rem,calc(100vw-2rem))]',
      )}
      headerClassName="px-6 py-4"
      bodyClassName="flex min-h-0 flex-col space-y-0 overflow-hidden p-0"
    >
      <form className="flex min-h-0 flex-1 flex-col gap-0" onSubmit={(e) => void save(e)}>
        {channel && (
          <Tabs<'overview' | 'permissions'>
            value={tab}
            onChange={setTab}
            options={[
              { id: 'overview', label: 'Overview' },
              { id: 'permissions', label: 'Permissions' },
            ]}
          />
        )}
        <div className="channel-editor-body min-h-0 flex-1 space-y-6 overflow-y-auto px-6 py-5">
          {tab === 'overview' ? (
            <section className="space-y-4">
              <label>
                Channel name
                <input
                  autoFocus
                  required
                  maxLength={60}
                  placeholder={kind === 'voice' ? 'Late night call' : 'clips-and-chaos'}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </label>
              <div className="flex flex-col gap-2">
                <span id="channel-type" className="text-xs font-medium text-muted-foreground">
                  Channel type
                </span>
                <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-labelledby="channel-type">
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
              </div>
              <CategorySelect detail={detail} value={categoryId} onChange={setCategoryId} />
              {channel && categoryId && categoryId !== (channel.categoryId ?? null) && (
                <p className="text-[11px] text-muted-foreground">
                  Moving it into a category makes it follow that category’s permissions.
                </p>
              )}
              {!channel && (
                <div className="overflow-hidden rounded-lg border border-border bg-background/45">
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
              )}
            </section>
          ) : (
            <section className="space-y-4">
              {category && (
                <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-background/45 px-3.5 py-2.5 text-xs">
                  <span className="min-w-0 text-muted-foreground" role="status">
                    {channel?.synced
                      ? `Permissions synced with ${category.name}. Changing anything here gives this channel permissions of its own.`
                      : `Permissions not synced with ${category.name}.`}
                  </span>
                  {!channel?.synced && (
                    <button
                      type="button"
                      className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border border-border px-3 text-xs font-medium transition-colors hover:bg-accent disabled:opacity-50"
                      disabled={busy}
                      onClick={() => void run(() => api.request(`/api/channels/${channel!.id}/sync`, 'POST'))}
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
                actorPermissions={channel?.permissions ?? access.permissions}
                scope={kind}
                overrides={overrides}
                onChange={setOverrides}
              />
            </section>
          )}

          {error && (
            <p role="alert" className="form-error rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {error}
            </p>
          )}
        </div>

        <footer className="flex items-center gap-2 border-t border-border bg-background/55 px-6 py-3.5">
          {channel && (
            <button
              className="danger-action mr-auto inline-flex h-9 items-center justify-center gap-2 rounded-md px-2 text-sm font-medium text-destructive transition-colors hover:bg-destructive/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              type="button"
              onClick={() => setConfirmDelete(true)}
            >
              <Trash2 className="size-4" /> Delete channel
            </button>
          )}
          <button className={channel ? '' : 'ml-auto'} type="button" onClick={onClose}>
            <span className="inline-flex h-9 items-center justify-center rounded-md px-4 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
              Cancel
            </span>
          </button>
          <button className={primaryClass} disabled={busy}>
            {busy ? 'Saving…' : 'Save channel'}
          </button>
        </footer>
      </form>
      {channel && confirmDelete && (
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
    </Modal>
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
  const synced = detail.channels.filter((channel) => channel.categoryId === categoryId && channel.synced).length;

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
  const save = (event: FormEvent) => {
    event.preventDefault();
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

  return (
    <Modal
      title={category ? 'Edit category' : 'Create category'}
      onClose={onClose}
      contentClassName={cn(
        'category-editor-modal',
        category ? 'h-[min(40rem,calc(100vh-2rem))] max-h-none w-[min(52rem,calc(100vw-2rem))]' : 'w-[min(30rem,calc(100vw-2rem))]',
      )}
      headerClassName="px-6 py-4"
      bodyClassName="flex min-h-0 flex-col space-y-0 overflow-hidden p-0"
    >
      <form className="flex min-h-0 flex-1 flex-col" onSubmit={save}>
        {category && (
          <Tabs<'overview' | 'permissions'>
            value={tab}
            onChange={setTab}
            options={[
              { id: 'overview', label: 'Overview' },
              { id: 'permissions', label: 'Permissions' },
            ]}
          />
        )}
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-5">
          {tab === 'overview' ? (
            <label>
              Category name
              <input
                autoFocus
                required
                maxLength={60}
                placeholder="STAFF"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
          ) : (
            <>
              <p className="text-xs text-muted-foreground" role="status">
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
          {error && (
            <p role="alert" className="form-error rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {error}
            </p>
          )}
        </div>
        <footer className="flex items-center gap-2 border-t border-border bg-background/55 px-6 py-3.5">
          {category && (
            <button
              className="danger-action mr-auto inline-flex h-9 items-center justify-center gap-2 rounded-md px-2 text-sm font-medium text-destructive transition-colors hover:bg-destructive/10"
              type="button"
              onClick={() => setConfirmDelete(true)}
            >
              <Trash2 className="size-4" /> Delete category
            </button>
          )}
          <button className={category ? '' : 'ml-auto'} type="button" onClick={onClose}>
            <span className="inline-flex h-9 items-center justify-center rounded-md px-4 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
              Cancel
            </span>
          </button>
          <button className={primaryClass} disabled={busy}>
            {busy ? 'Saving…' : category ? 'Save category' : 'Create category'}
          </button>
        </footer>
      </form>
      {category && confirmDelete && (
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
    </Modal>
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
      <span className={`grid size-8 shrink-0 place-items-center rounded-md ${active ? 'bg-primary text-primary-foreground' : 'bg-secondary text-foreground'}`}>
        {icon}
      </span>
      <span className="flex min-w-0 flex-col">
        <strong className="text-sm font-semibold">{title}</strong>
        <small className="text-[11px] text-muted-foreground">{description}</small>
      </span>
      <span className={`ml-auto size-3.5 rounded-full border ${active ? 'border-[4px] border-primary bg-primary-foreground' : 'border-input'}`} aria-hidden="true" />
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
        {description && <small className="mt-0.5 text-[11px] leading-4 text-muted-foreground">{description}</small>}
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
        <span className="absolute inset-0 rounded-full bg-input transition-colors peer-checked:bg-primary" aria-hidden="true" />
        <span className="absolute left-0.5 top-0.5 size-4 rounded-full bg-foreground shadow-sm transition-transform peer-checked:translate-x-4 peer-checked:bg-primary-foreground" aria-hidden="true" />
      </span>
    </label>
  );
}
