import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import {
  Hash,
  LockKeyhole,
  LogOut,
  MoreVertical,
  Settings,
  Ticket,
  Trash2,
  Users,
  Volume2,
} from 'lucide-react';
import {
  canManage,
  type Account,
  type Community,
  type CommunityChannel,
  type CommunityDetail,
  type CommunityInvite,
} from '../../shared/community';
import type { CommunityClient } from '../infrastructure/community-client';
import { Modal } from './modal';
import { ConfirmDialog, type Confirmation } from './confirm-dialog';
import { Avatar } from './avatar';
import { PictureField } from './picture-field';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from './ui/dropdown-menu';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Request failed. Please try again.';
}
export function AddServerDialog({
  api,
  onClose,
  onCreated,
}: {
  api: CommunityClient;
  onClose(): void;
  onCreated(id: string): void;
}) {
  const [mode, setMode] = useState<'create' | 'join'>('create');
  const [value, setValue] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      if (mode === 'create')
        onCreated((await api.request<Community>('/api/servers', 'POST', { name: value })).id);
      else
        onCreated(
          (await api.request<{ serverId: string }>('/api/invites/join', 'POST', { code: value.trim() }))
            .serverId,
        );
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal title={mode === 'create' ? 'Create a server' : 'Join a server'} onClose={onClose}>
      <div className="dialog-tabs inline-flex items-center gap-1 rounded-xl bg-secondary/60 p-1">
        <button
          aria-pressed={mode === 'create'}
          onClick={() => {
            setMode('create');
            setValue('');
          }}
        >
          Create
        </button>
        <button
          aria-pressed={mode === 'join'}
          onClick={() => {
            setMode('join');
            setValue('');
          }}
        >
          Join with invite
        </button>
      </div>
      <p>
        {mode === 'create'
          ? 'Give this circle a name. Nobody else can see it until you invite them.'
          : 'Paste the invite code shared by an owner or administrator.'}
      </p>
      <form onSubmit={(e) => void submit(e)}>
        <label>
          {mode === 'create' ? 'Server name' : 'Invite code'}
          <input
            autoFocus
            required
            maxLength={mode === 'create' ? 60 : 128}
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
        </label>
        {error && (
          <p className="form-error rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive" role="alert">
            {error}
          </p>
        )}
        <button className="primary-action inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50" disabled={busy}>
          {busy ? 'Please wait…' : mode === 'create' ? 'Create server' : 'Join server'}
        </button>
      </form>
    </Modal>
  );
}

export function ChannelDialog({
  api,
  detail,
  channel,
  type = 'voice',
  onClose,
  onSaved,
}: {
  api: CommunityClient;
  detail: CommunityDetail;
  channel?: CommunityChannel;
  /** Which group the plus was under, for a channel that does not exist yet. */
  type?: 'text' | 'voice';
  onClose(): void;
  onSaved(): Promise<void>;
}) {
  const [draft, setDraft] = useState<Omit<CommunityChannel, 'id' | 'serverId'>>(
    channel ?? {
      name: '',
      type,
      private: false,
      memberIds: [],
      allowSpeak: true,
      allowShare: true,
      readOnly: false,
    },
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const { name, type, private: isPrivate, memberIds, allowSpeak, allowShare, readOnly } = draft;
      await api.request(
        channel ? `/api/channels/${channel.id}` : `/api/servers/${detail.server.id}/channels`,
        channel ? 'PATCH' : 'POST',
        { name, type, private: isPrivate, memberIds, allowSpeak, allowShare, readOnly },
      );
      await onSaved();
      onClose();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  async function remove() {
    setBusy(true);
    setError('');
    try {
      await api.request(`/api/channels/${channel!.id}`, 'DELETE');
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
      contentClassName="channel-editor-modal w-[min(42rem,calc(100vw-2rem))]"
      headerClassName="px-6 py-4"
      bodyClassName="flex min-h-0 flex-col space-y-0 overflow-hidden p-0"
    >
      <form className="flex min-h-0 flex-1 flex-col gap-0" onSubmit={(e) => void save(e)}>
        <div className="channel-editor-body space-y-6 overflow-y-auto px-6 py-5">
          <section className="space-y-4">
            <div>
              <h2 className="text-sm font-semibold text-foreground">Channel details</h2>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                Give the room a clear purpose. You can change permissions at any time.
              </p>
            </div>
            <label>
              Channel name
              <input
                autoFocus
                required
                maxLength={60}
                placeholder={draft.type === 'voice' ? 'Late night call' : 'clips-and-chaos'}
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              />
            </label>
            <div className="flex flex-col gap-2">
              <span id="channel-type" className="text-xs font-medium text-muted-foreground">
                Channel type
              </span>
              <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-labelledby="channel-type">
                <ChannelTypeChoice
                  active={draft.type === 'text'}
                  disabled={!!channel}
                  icon={<Hash className="size-4" />}
                  title="Text chat"
                  description="Messages and files"
                  onClick={() => setDraft({ ...draft, type: 'text' })}
                />
                <ChannelTypeChoice
                  active={draft.type === 'voice'}
                  disabled={!!channel}
                  icon={<Volume2 className="size-4" />}
                  title="Voice call"
                  description="Voice and screen share"
                  onClick={() => setDraft({ ...draft, type: 'voice' })}
                />
              </div>
            </div>
          </section>

          <section className="overflow-hidden rounded-lg border border-border bg-background/45">
            <ToggleRow
              label="Private channel"
              description="Only selected members can find and enter this room."
              checked={draft.private}
              onChange={(checked) => setDraft({ ...draft, private: checked })}
            />
            {draft.private && (
              <div className="border-t border-border px-4 py-3">
                <div className="mb-2">
                  <h3 className="text-xs font-semibold text-foreground">Members with access</h3>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    Owners and administrators always have access.
                  </p>
                </div>
                <div className="divide-y divide-border/70">
                  {detail.members
                    .filter((member) => member.role === 'member')
                    .map((member) => (
                      <ToggleRow
                        compact
                        key={member.id}
                        label={member.displayName}
                        description={`@${member.username}`}
                        checked={draft.memberIds.includes(member.id)}
                        onChange={(checked) =>
                          setDraft({
                            ...draft,
                            memberIds: checked
                              ? [...draft.memberIds, member.id]
                              : draft.memberIds.filter((id) => id !== member.id),
                          })
                        }
                      />
                    ))}
                </div>
                {!detail.members.some((member) => member.role === 'member') && (
                  <small className="block py-2 text-muted-foreground">Invite members to add them here.</small>
                )}
              </div>
            )}
          </section>

          <fieldset className="overflow-hidden rounded-lg border border-border bg-background/45">
            <div className="border-b border-border px-4 py-3">
              <legend className="text-sm font-semibold text-foreground">Member permissions</legend>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                Owners and administrators always keep full access.
              </p>
            </div>
            <div className="divide-y divide-border/70">
              {draft.type === 'voice' ? (
                <>
                  <ToggleRow
                    label="Speak in this call"
                    description="Members can use their microphone."
                    checked={draft.allowSpeak}
                    onChange={(checked) => setDraft({ ...draft, allowSpeak: checked })}
                  />
                  <ToggleRow
                    label="Share screen and system audio"
                    description="Members can start a live screen share."
                    checked={draft.allowShare}
                    onChange={(checked) => setDraft({ ...draft, allowShare: checked })}
                  />
                </>
              ) : (
                <ToggleRow
                  label="Send messages"
                  description="Turn this off to make the channel read-only for members."
                  checked={!draft.readOnly}
                  onChange={(checked) => setDraft({ ...draft, readOnly: !checked })}
                />
              )}
            </div>
          </fieldset>

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
          <button
            className={channel ? '' : 'ml-auto'}
            type="button"
            onClick={onClose}
          >
            <span className="inline-flex h-9 items-center justify-center rounded-md px-4 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
              Cancel
            </span>
          </button>
          <button className="primary-action inline-flex h-9 items-center justify-center rounded-md bg-primary px-5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50" disabled={busy}>
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
            action: remove,
          }}
          busy={busy}
          onCancel={() => setConfirmDelete(false)}
          onConfirm={() => void remove()}
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

function ToggleRow({
  label,
  description,
  checked,
  onChange,
  compact = false,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange(checked: boolean): void;
  compact?: boolean;
}) {
  return (
    <label className={`permission-row check-row flex cursor-pointer flex-row items-center gap-4 px-4 transition-colors hover:bg-accent/45 ${compact ? 'py-2.5' : 'py-3.5'}`}>
      <span className="flex min-w-0 flex-1 flex-col">
        <strong className="truncate text-sm font-medium text-foreground">{label}</strong>
        {description && <small className="mt-0.5 text-[11px] leading-4 text-muted-foreground">{description}</small>}
      </span>
      <span className="relative h-5 w-9 shrink-0">
        <input
          className="peer absolute inset-0 z-10 size-full cursor-pointer opacity-0"
          type="checkbox"
          aria-label={label}
          checked={checked}
          onChange={(event) => onChange(event.target.checked)}
        />
        <span className="absolute inset-0 rounded-full bg-input transition-colors peer-checked:bg-primary" aria-hidden="true" />
        <span className="absolute left-0.5 top-0.5 size-4 rounded-full bg-foreground shadow-sm transition-transform peer-checked:translate-x-4 peer-checked:bg-primary-foreground" aria-hidden="true" />
      </span>
    </label>
  );
}

export function ServerDialog({
  api,
  user,
  detail,
  onClose,
  onChanged,
  onRemoved,
}: {
  api: CommunityClient;
  user: Account;
  detail: CommunityDetail;
  onClose(): void;
  onChanged(): Promise<void>;
  onRemoved(): void;
}) {
  const [tab, setTab] = useState<'members' | 'invites' | 'settings'>('members');
  const [name, setName] = useState(detail.server.name);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [invites, setInvites] = useState<CommunityInvite[]>([]);
  const [code, setCode] = useState('');
  const [hours, setHours] = useState(24);
  const [maxUses, setMaxUses] = useState(1);
  const [confirmation, setConfirmation] = useState<Confirmation>();
  // One row's menu at a time, held here rather than in each row, so reaching for
  // a second member puts the first one away.
  const [openMenu, setOpenMenu] = useState<string>();
  const manager = canManage(detail.server.role);
  const owner = detail.server.role === 'owner';
  const base = `/api/servers/${detail.server.id}`;
  const loadInvites = async () => {
    if (manager) setInvites((await api.request<{ invites: CommunityInvite[] }>(`${base}/invites`)).invites);
  };
  useEffect(() => {
    void loadInvites().catch((e) => setError(errorMessage(e)));
  }, [detail.server.id]);
  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError('');
    try {
      await action();
      await onChanged();
      await loadInvites();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
      setConfirmation(undefined);
    }
  }
  const tabMeta = {
    members: {
      title: 'Members',
      description: 'See who belongs here and decide what each person can manage.',
    },
    invites: {
      title: 'Invites',
      description: 'Create temporary access codes and revoke them whenever you need.',
    },
    settings: {
      title: 'Server identity',
      description: 'Keep the name and picture recognizable for everyone in the room.',
    },
  }[tab];
  const requestRemoval = () =>
    setConfirmation({
      title: owner ? 'Delete server' : 'Leave server',
      description: owner
        ? `Permanently delete ${detail.server.name}, its channels and every message in them? This cannot be undone.`
        : `Leave ${detail.server.name}? You will need a new invitation to return.`,
      confirmLabel: owner ? 'Delete' : 'Leave',
      tone: 'danger',
      action: async () => {
        await api.request(owner ? base : `${base}/members/${user.id}`, 'DELETE');
        onRemoved();
      },
    });
  return (
    <Modal
      title={detail.server.name}
      onClose={onClose}
      contentClassName="server-workspace-modal h-[min(42rem,calc(100vh-2rem))] max-h-none w-[min(56rem,calc(100vw-2rem))]"
      headerClassName="h-15 px-6 py-0"
      bodyClassName="flex min-h-0 flex-col space-y-0 overflow-hidden p-0"
    >
      <div className="grid min-h-0 flex-1 grid-cols-[12rem_minmax(0,1fr)]">
        <aside className="flex min-h-0 flex-col border-r border-border bg-background/45 p-3">
          <div className="px-2 pb-3 pt-1">
            <span className="text-[11px] font-medium text-muted-foreground">Server settings</span>
          </div>
          <nav className="flex flex-col gap-1" aria-label="Server settings sections">
            <button
              className={`flex h-9 items-center gap-2.5 rounded-md px-2.5 text-sm font-medium transition-colors ${tab === 'members' ? 'bg-accent text-foreground' : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground'}`}
              aria-pressed={tab === 'members'}
              onClick={() => setTab('members')}
            >
              <Users className="size-4" /> Members
              <span className="ml-auto font-mono text-[10px] text-muted-foreground">{detail.members.length}</span>
            </button>
            {manager && (
              <>
                <button
                  className={`flex h-9 items-center gap-2.5 rounded-md px-2.5 text-sm font-medium transition-colors ${tab === 'invites' ? 'bg-accent text-foreground' : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground'}`}
                  aria-pressed={tab === 'invites'}
                  onClick={() => setTab('invites')}
                >
                  <Ticket className="size-4" /> Invites
                </button>
                <button
                  className={`flex h-9 items-center gap-2.5 rounded-md px-2.5 text-sm font-medium transition-colors ${tab === 'settings' ? 'bg-accent text-foreground' : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground'}`}
                  aria-pressed={tab === 'settings'}
                  onClick={() => setTab('settings')}
                >
                  <Settings className="size-4" /> Settings
                </button>
              </>
            )}
          </nav>
          <div className="mt-auto border-t border-border pt-3">
            <button
              className="flex h-9 w-full items-center gap-2.5 rounded-md px-2.5 text-left text-sm font-medium text-destructive transition-colors hover:bg-destructive/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50"
              disabled={busy}
              onClick={requestRemoval}
            >
              <Trash2 className="size-4" /> {owner ? 'Delete server' : 'Leave server'}
            </button>
          </div>
        </aside>

        <section className="min-h-0 min-w-0 overflow-y-auto">
          <header className="sticky top-0 z-10 border-b border-border bg-card px-6 py-4">
            <h2 className="text-base font-semibold text-foreground">{tabMeta.title}</h2>
            <p className="mt-1 max-w-xl text-xs leading-5 text-muted-foreground">{tabMeta.description}</p>
          </header>
          <div className="server-workspace-content space-y-6 px-6 py-5">
      {tab === 'members' && (
        <div className="member-list overflow-hidden rounded-lg border border-border bg-background/35 divide-y divide-border">
          {detail.members.map((member) => {
            const removable =
              manager &&
              member.id !== user.id &&
              member.role !== 'owner' &&
              (owner || member.role === 'member');
            const transferable = owner && member.id !== user.id;
            return (
              <div
                className="member-row flex h-14 items-center gap-3 px-3.5 py-2 text-sm transition-colors hover:bg-accent/40"
                key={member.id}
              >
                <Avatar
                  className="grid size-9 shrink-0 place-items-center rounded-full bg-secondary text-[11px] font-bold text-secondary-foreground"
                  name={member.displayName}
                  imageId={member.avatarId}
                />
                <div className="flex min-w-0 flex-col leading-tight">
                  <strong className="truncate font-semibold" title={member.displayName}>
                    {member.displayName}
                    {member.id === user.id ? ' (you)' : ''}
                  </strong>
                  <small className="truncate text-xs text-muted-foreground" title={`@${member.username}`}>
                    @{member.username}
                  </small>
                </div>
                {/* The controls keep to the right, at one width, so the column
                    reads straight however long the names are. */}
                <div className="ml-auto flex shrink-0 items-center gap-2">
                  {owner && member.role !== 'owner' ? (
                    <Select
                      disabled={busy}
                      value={member.role}
                      onValueChange={(role) =>
                        void run(() => api.request(`${base}/members/${member.id}`, 'PATCH', { role }))
                      }
                    >
                      <SelectTrigger className="h-8 w-36" aria-label={`Role for ${member.displayName}`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="member">Member</SelectItem>
                        <SelectItem value="admin">Administrator</SelectItem>
                      </SelectContent>
                    </Select>
                  ) : (
                    <span className="member-role rounded-md bg-secondary px-2 py-1 text-xs font-medium capitalize text-muted-foreground">
                      {member.role}
                    </span>
                  )}
                  {(removable || transferable) && (
                    <DropdownMenu
                      open={openMenu === member.id}
                      onOpenChange={(open) => setOpenMenu(open ? member.id : undefined)}
                    >
                      <DropdownMenuTrigger asChild>
                        <button
                          className="icon-action grid size-8 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                          disabled={busy}
                          aria-label={`Manage ${member.displayName}`}
                          type="button"
                        >
                          <MoreVertical aria-hidden="true" className="size-4" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {transferable && (
                          <DropdownMenuItem
                            onSelect={() =>
                              setConfirmation({
                                title: 'Transfer ownership',
                                description: `Make ${member.displayName} the owner of ${detail.server.name}? You will become an administrator, and only they will be able to give it back.`,
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
                        {removable && (
                          <DropdownMenuItem
                            className="text-destructive focus:bg-destructive focus:text-destructive-foreground data-[highlighted]:bg-destructive data-[highlighted]:text-destructive-foreground"
                            onSelect={() =>
                              setConfirmation({
                                title: 'Remove member',
                                description: `Remove ${member.displayName} from ${detail.server.name}? They will need a new invitation to come back.`,
                                confirmLabel: 'Remove',
                                tone: 'danger',
                                action: async () => {
                                  await api.request(`${base}/members/${member.id}`, 'DELETE');
                                },
                              })
                            }
                          >
                            Remove from server
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
      {tab === 'invites' && (
        <div className="space-y-6">
          <section className="rounded-lg border border-border bg-background/40 p-4">
            <div className="mb-4">
              <h3 className="text-sm font-semibold text-foreground">New invitation</h3>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                Only share the generated code with people you want in this server.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5 text-xs font-medium text-muted-foreground">
                <span id="invite-expiry">Expires in</span>
                <Select value={String(hours)} onValueChange={(value) => setHours(Number(value))}>
                  <SelectTrigger aria-labelledby="invite-expiry">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">1 hour</SelectItem>
                    <SelectItem value="24">24 hours</SelectItem>
                    <SelectItem value="168">7 days</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <label>
                Maximum uses
                <input
                  type="number"
                  min={1}
                  max={100}
                  value={maxUses}
                  onChange={(e) => setMaxUses(Number(e.target.value))}
                />
              </label>
            </div>
            <button
              type="button"
              disabled={busy}
              className="primary-action mt-4 inline-flex h-9 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50"
              onClick={() =>
                void run(async () => {
                  setCode(
                    (await api.request<{ code: string }>(`${base}/invites`, 'POST', { hours, maxUses })).code,
                  );
                })
              }
            >
              Generate invite
            </button>
            {code && (
              <label className="mt-4">
                Invite code — copy and share
                <textarea
                  className="font-mono text-xs"
                  readOnly
                  value={code}
                  onFocus={(event) => event.target.select()}
                />
              </label>
            )}
          </section>

          <section>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-foreground">Active invitations</h3>
              <span className="font-mono text-[10px] text-muted-foreground">{invites.length}</span>
            </div>
            {invites.length ? (
              <div className="overflow-hidden rounded-lg border border-border bg-background/35 divide-y divide-border">
                {invites.map((invite) => (
                  <div className="member-row flex min-h-14 items-center gap-3 px-3.5 py-2.5 text-sm" key={invite.id}>
                    <span className="flex min-w-0 flex-col">
                      <strong className="font-medium text-foreground">
                        {invite.uses} of {invite.maxUses} uses
                      </strong>
                      <small className="text-xs text-muted-foreground">
                        Expires {new Date(invite.expiresAt).toLocaleString()}
                      </small>
                    </span>
                    <button
                      className="ml-auto rounded-md px-2.5 py-1.5 text-xs font-medium text-destructive transition-colors hover:bg-destructive/10"
                      disabled={busy}
                      onClick={() => void run(() => api.request(`${base}/invites/${invite.id}`, 'DELETE'))}
                    >
                      Revoke
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-xs text-muted-foreground">
                No active invitation codes.
              </div>
            )}
          </section>
        </div>
      )}
      {tab === 'settings' && (
        <div className="space-y-4">
          <PictureField
            name={detail.server.name}
            imageId={detail.server.iconId}
            label="Server picture"
            canEdit={manager}
            onChoose={async (image) => {
              await api.upload(`${base}/icon`, image);
              await onChanged();
            }}
            onRemove={async () => {
              await api.request(`${base}/icon`, 'DELETE');
              await onChanged();
            }}
          />
          <section className="rounded-lg border border-border bg-background/40 p-4">
            <div className="mb-4">
              <h3 className="text-sm font-semibold text-foreground">Display name</h3>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                This is how the server appears in every member's sidebar.
              </p>
            </div>
            <form
              className="flex flex-row items-end gap-2.5"
              onSubmit={(e) => {
                e.preventDefault();
                void run(() => api.request(base, 'PATCH', { name }));
              }}
            >
              <label className="min-w-0 flex-1">
                Server name
                <input required maxLength={60} value={name} onChange={(e) => setName(e.target.value)} />
              </label>
              <button className="primary-action inline-flex h-9 shrink-0 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50" disabled={busy}>
                Rename server
              </button>
            </form>
          </section>
        </div>
      )}
      {error && (
        <p className="form-error rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive" role="alert">
          {error}
        </p>
      )}
          </div>
        </section>
      </div>
      {confirmation && (
        <ConfirmDialog
          confirmation={confirmation}
          busy={busy}
          onCancel={() => setConfirmation(undefined)}
          onConfirm={() => void run(confirmation.action)}
        />
      )}
    </Modal>
  );
}

export function AccountDialog({
  api,
  user,
  onClose,
  onLogout,
  onProfileChanged,
}: {
  api: CommunityClient;
  user: Account;
  onClose(): void;
  onLogout(): Promise<void>;
  onProfileChanged(): Promise<void>;
}) {
  const [currentPassword, setCurrent] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <Modal title="Your account" onClose={onClose}>
      <div className="account-identity flex items-center gap-3 border-b border-border pb-4">
        <Avatar name={user.displayName} imageId={user.avatarId} className="account-avatar grid size-12 shrink-0 place-items-center rounded-2xl bg-secondary text-sm font-bold text-secondary-foreground" />
        <div className="flex min-w-0 flex-col leading-tight">
          <strong className="truncate text-sm font-semibold">{user.displayName}</strong>
          <span className="truncate text-xs text-muted-foreground">@{user.username}</span>
        </div>
        <span className="account-badge ml-auto rounded-full bg-success/15 px-2.5 py-1 text-[11px] font-semibold text-success">Signed in</span>
      </div>
      <PictureField
        name={user.displayName}
        imageId={user.avatarId}
        label="Profile picture"
        canEdit
        onChoose={async (image) => {
          await api.upload('/api/account/avatar', image);
          await onProfileChanged();
        }}
        onRemove={async () => {
          await api.request('/api/account/avatar', 'DELETE');
          await onProfileChanged();
        }}
      />
      <section className="account-security space-y-3">
        <div className="section-heading flex items-start gap-2 text-sm font-semibold text-foreground">
          <LockKeyhole size={18} aria-hidden="true" className="mt-0.5 shrink-0 text-primary" />
          <div className="flex flex-col gap-0.5">
            <h3 className="text-sm font-semibold">Password &amp; security</h3>
            <p className="text-xs font-normal text-muted-foreground">
              Use a unique password to keep your rooms private.
            </p>
          </div>
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setBusy(true);
            setMessage('');
            void api
              .request('/api/auth/password', 'POST', { currentPassword, password })
              .then(() => {
                setCurrent('');
                setPassword('');
                setMessage('Password changed. Other sessions were signed out.');
              })
              .catch((e) => setMessage(errorMessage(e)))
              .finally(() => setBusy(false));
          }}
        >
          <label>
            Current password
            <input
              type="password"
              autoComplete="current-password"
              required
              maxLength={128}
              value={currentPassword}
              onChange={(e) => setCurrent(e.target.value)}
            />
          </label>
          <div className="form-field flex flex-col gap-1.5 text-xs font-medium text-muted-foreground">
            <label>
              New password
              <input
                type="password"
                autoComplete="new-password"
                required
                minLength={12}
                maxLength={128}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                aria-describedby="password-hint"
              />
            </label>
            <small id="password-hint">At least 12 characters. Other devices will be signed out.</small>
          </div>
          <div className="form-actions flex flex-wrap items-center justify-end gap-2">
            <button className="primary-action inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50" disabled={busy}>
              {busy ? 'Please wait…' : 'Change password'}
            </button>
          </div>
        </form>
        {message && <p role="status">{message}</p>}
      </section>
      <footer className="account-session flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4 text-sm">
        <div className="flex min-w-0 flex-col leading-tight">
          <strong className="text-sm font-semibold">This device</strong>
          <small className="text-xs text-muted-foreground">Sign out of Pulse Room on this computer.</small>
        </div>
        <button
          disabled={busy}
          className="danger-action inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-destructive/40 bg-transparent px-4 text-sm font-medium text-destructive transition-colors hover:bg-destructive/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50"
          onClick={() => {
            setBusy(true);
            void onLogout().catch((e) => {
              setMessage(errorMessage(e));
              setBusy(false);
            });
          }}
        >
          <LogOut size={15} aria-hidden="true" /> Sign out
        </button>
      </footer>
    </Modal>
  );
}
