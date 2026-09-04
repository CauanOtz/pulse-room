import { useEffect, useState, type FormEvent } from 'react';
import { LockKeyhole, LogOut, MoreVertical } from 'lucide-react';
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
    <Modal title={channel ? 'Edit channel' : 'Create channel'} onClose={onClose}>
      <form onSubmit={(e) => void save(e)}>
        <label>
          Channel name
          <input
            autoFocus
            required
            maxLength={60}
            value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          />
        </label>
        <div className="flex flex-col gap-1.5 text-xs font-medium text-muted-foreground">
          <span id="channel-type">Channel type</span>
          <Select
            disabled={!!channel}
            value={draft.type}
            onValueChange={(value) => setDraft({ ...draft, type: value as 'voice' | 'text' })}
          >
            <SelectTrigger aria-labelledby="channel-type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="voice">Voice call</SelectItem>
              <SelectItem value="text">Text chat</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <label className="check-row flex items-center gap-2.5 rounded-lg px-1 py-1.5 text-sm text-foreground">
          <input
            type="checkbox"
            checked={draft.private}
            onChange={(e) => setDraft({ ...draft, private: e.target.checked })}
          />
          Private channel
        </label>
        {draft.private && (
          <fieldset>
            <legend>Members who can enter</legend>
            <p>Owners and administrators always have access.</p>
            {detail.members
              .filter((m) => m.role === 'member')
              .map((member) => (
                <label className="check-row flex items-center gap-2.5 rounded-lg px-1 py-1.5 text-sm text-foreground" key={member.id}>
                  <input
                    type="checkbox"
                    checked={draft.memberIds.includes(member.id)}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        memberIds: e.target.checked
                          ? [...draft.memberIds, member.id]
                          : draft.memberIds.filter((id) => id !== member.id),
                      })
                    }
                  />
                  {member.displayName}
                </label>
              ))}
            {!detail.members.some((m) => m.role === 'member') && (
              <small>Invite members to add them here.</small>
            )}
          </fieldset>
        )}
        <fieldset>
          <legend>Member permissions</legend>
          {draft.type === 'voice' ? (
            <>
              <label className="check-row flex items-center gap-2.5 rounded-lg px-1 py-1.5 text-sm text-foreground">
                <input
                  type="checkbox"
                  checked={draft.allowSpeak}
                  onChange={(e) => setDraft({ ...draft, allowSpeak: e.target.checked })}
                />
                Speak in this call
              </label>
              <label className="check-row flex items-center gap-2.5 rounded-lg px-1 py-1.5 text-sm text-foreground">
                <input
                  type="checkbox"
                  checked={draft.allowShare}
                  onChange={(e) => setDraft({ ...draft, allowShare: e.target.checked })}
                />
                Share screen and system audio
              </label>
            </>
          ) : (
            <label className="check-row flex items-center gap-2.5 rounded-lg px-1 py-1.5 text-sm text-foreground">
              <input
                type="checkbox"
                checked={!draft.readOnly}
                onChange={(e) => setDraft({ ...draft, readOnly: !e.target.checked })}
              />
              Send messages
            </label>
          )}
          <small>
            These limits apply to members. Owners and administrators can always speak, share and post.
          </small>
        </fieldset>
        {error && (
          <p role="alert" className="form-error rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {error}
          </p>
        )}
        <button className="primary-action inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50" disabled={busy}>
          {busy ? 'Saving…' : 'Save channel'}
        </button>
      </form>
      {channel && (
        <div className="danger-zone space-y-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4">
          <button className="danger-action inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-destructive/40 bg-transparent px-4 text-sm font-medium text-destructive transition-colors hover:bg-destructive/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50" onClick={() => setConfirmDelete(true)}>
            Delete channel
          </button>
        </div>
      )}
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
  const [tab, setTab] = useState('members');
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
  return (
    <Modal title={detail.server.name} onClose={onClose}>
      <div className="dialog-tabs inline-flex items-center gap-1 rounded-xl bg-secondary/60 p-1">
        {['members', ...(manager ? ['invites', 'settings'] : [])].map((item) => (
          <button key={item} aria-pressed={tab === item} onClick={() => setTab(item)}>
            {item[0].toUpperCase() + item.slice(1)}
          </button>
        ))}
      </div>
      {tab === 'members' && (
        <div className="member-list flex flex-col gap-1.5">
          {detail.members.map((member) => {
            const removable =
              manager &&
              member.id !== user.id &&
              member.role !== 'owner' &&
              (owner || member.role === 'member');
            const transferable = owner && member.id !== user.id;
            return (
              <div
                className="member-row flex items-center gap-3 rounded-xl border border-border bg-background/60 px-3 py-2.5 text-sm"
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
        <>
          <p>Only share this code with people you want in this server. Invites expire and can be revoked.</p>
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
          <button
            disabled={busy}
            className="primary-action inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50"
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
            <label>
              Invite code — copy and share
              <textarea readOnly value={code} onFocus={(e) => e.target.select()} />
            </label>
          )}
          {invites.map((invite) => (
            <div className="member-row flex items-center gap-3 rounded-xl border border-border bg-background/60 px-3 py-2.5 text-sm" key={invite.id}>
              <span>
                {invite.uses}/{invite.maxUses} uses
                <small>Expires {new Date(invite.expiresAt).toLocaleString()}</small>
              </span>
              <button
                disabled={busy}
                onClick={() => void run(() => api.request(`${base}/invites/${invite.id}`, 'DELETE'))}
              >
                Revoke
              </button>
            </div>
          ))}
        </>
      )}
      {tab === 'settings' && (
        <>
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
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void run(() => api.request(base, 'PATCH', { name }));
          }}
        >
          <label>
            Server name
            <input required maxLength={60} value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <button className="primary-action inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50" disabled={busy}>
            Rename server
          </button>
        </form>
        </>
      )}
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
          onConfirm={() => void run(confirmation.action)}
        />
      )}
      <div className="danger-zone space-y-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4">
        <button
          className="danger-action inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-destructive/40 bg-transparent px-4 text-sm font-medium text-destructive transition-colors hover:bg-destructive/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50"
          disabled={busy}
          onClick={() =>
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
            })
          }
        >
          {owner ? 'Delete server' : 'Leave server'}
        </button>
      </div>
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
