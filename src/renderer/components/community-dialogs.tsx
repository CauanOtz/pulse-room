import { useEffect, useState, type FormEvent } from 'react';
import { LockKeyhole, LogOut } from 'lucide-react';
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
      <div className="dialog-tabs">
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
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <button className="primary-action" disabled={busy}>
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
  onClose,
  onSaved,
}: {
  api: CommunityClient;
  detail: CommunityDetail;
  channel?: CommunityChannel;
  onClose(): void;
  onSaved(): Promise<void>;
}) {
  const [draft, setDraft] = useState<Omit<CommunityChannel, 'id' | 'serverId'>>(
    channel ?? {
      name: '',
      type: 'voice',
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
        <label>
          Channel type
          <select
            disabled={!!channel}
            value={draft.type}
            onChange={(e) => setDraft({ ...draft, type: e.target.value as 'voice' | 'text' })}
          >
            <option value="voice">Voice call</option>
            <option value="text">Text chat</option>
          </select>
        </label>
        <label className="check-row">
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
                <label className="check-row" key={member.id}>
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
              <label className="check-row">
                <input
                  type="checkbox"
                  checked={draft.allowSpeak}
                  onChange={(e) => setDraft({ ...draft, allowSpeak: e.target.checked })}
                />
                Speak in this call
              </label>
              <label className="check-row">
                <input
                  type="checkbox"
                  checked={draft.allowShare}
                  onChange={(e) => setDraft({ ...draft, allowShare: e.target.checked })}
                />
                Share screen and system audio
              </label>
            </>
          ) : (
            <label className="check-row">
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
          <p role="alert" className="form-error">
            {error}
          </p>
        )}
        <button className="primary-action" disabled={busy}>
          {busy ? 'Saving…' : 'Save channel'}
        </button>
      </form>
      {channel && (
        <div className="danger-zone">
          {confirmDelete ? (
            <>
              <p>Delete #{channel.name} and all its messages? This cannot be undone.</p>
              <button className="danger-action" disabled={busy} onClick={() => void remove()}>
                Confirm delete channel
              </button>
              <button onClick={() => setConfirmDelete(false)}>Cancel</button>
            </>
          ) : (
            <button className="danger-action" onClick={() => setConfirmDelete(true)}>
              Delete channel
            </button>
          )}
        </div>
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
  onChannel,
  onRemoved,
}: {
  api: CommunityClient;
  user: Account;
  detail: CommunityDetail;
  onClose(): void;
  onChanged(): Promise<void>;
  onChannel(channel?: CommunityChannel): void;
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
  const [confirmation, setConfirmation] = useState<{ label: string; action: () => Promise<void> }>();
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
      <div className="dialog-tabs">
        {['members', ...(manager ? ['channels', 'invites', 'settings'] : [])].map((item) => (
          <button key={item} aria-pressed={tab === item} onClick={() => setTab(item)}>
            {item[0].toUpperCase() + item.slice(1)}
          </button>
        ))}
      </div>
      {tab === 'members' && (
        <div className="member-list">
          {detail.members.map((member) => (
            <div className="member-row" key={member.id}>
              <div>
                <strong>
                  {member.displayName}
                  {member.id === user.id ? ' (you)' : ''}
                </strong>
                <small>
                  @{member.username} · {member.role}
                </small>
              </div>
              {owner && member.role !== 'owner' && (
                <select
                  aria-label={`Role for ${member.displayName}`}
                  disabled={busy}
                  value={member.role}
                  onChange={(e) =>
                    void run(() =>
                      api.request(`${base}/members/${member.id}`, 'PATCH', { role: e.target.value }),
                    )
                  }
                >
                  <option value="member">Member</option>
                  <option value="admin">Administrator</option>
                </select>
              )}
              {manager &&
                member.id !== user.id &&
                member.role !== 'owner' &&
                (owner || member.role === 'member') && (
                  <button
                    disabled={busy}
                    onClick={() =>
                      setConfirmation({
                        label: `Remove ${member.displayName} from this server?`,
                        action: async () => {
                          await api.request(`${base}/members/${member.id}`, 'DELETE');
                        },
                      })
                    }
                  >
                    Remove
                  </button>
                )}
              {owner && member.id !== user.id && (
                <button
                  disabled={busy}
                  onClick={() =>
                    setConfirmation({
                      label: `Make ${member.displayName} the owner? You will become an administrator.`,
                      action: async () => {
                        await api.request(`${base}/transfer`, 'POST', { userId: member.id });
                      },
                    })
                  }
                >
                  Transfer ownership
                </button>
              )}
            </div>
          ))}
        </div>
      )}
      {tab === 'channels' && (
        <>
          <button className="primary-action" onClick={() => onChannel()}>
            Create channel
          </button>
          {detail.channels.map((channel) => (
            <div className="member-row" key={channel.id}>
              <span>
                {channel.type === 'text' ? '#' : '◖'} {channel.name}
                {channel.private ? ' · Private' : ''}
              </span>
              <button onClick={() => onChannel(channel)}>Edit permissions</button>
            </div>
          ))}
        </>
      )}
      {tab === 'invites' && (
        <>
          <p>Only share this code with people you want in this server. Invites expire and can be revoked.</p>
          <label>
            Expires in
            <select value={hours} onChange={(e) => setHours(Number(e.target.value))}>
              <option value={1}>1 hour</option>
              <option value={24}>24 hours</option>
              <option value={168}>7 days</option>
            </select>
          </label>
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
            className="primary-action"
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
            <div className="member-row" key={invite.id}>
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
          <button className="primary-action" disabled={busy}>
            Rename server
          </button>
        </form>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {confirmation && (
        <div className="confirm-panel" role="alert">
          <p>{confirmation.label}</p>
          <button disabled={busy} className="danger-action" onClick={() => void run(confirmation.action)}>
            Confirm
          </button>
          <button onClick={() => setConfirmation(undefined)}>Cancel</button>
        </div>
      )}
      <div className="danger-zone">
        <button
          className="danger-action"
          disabled={busy}
          onClick={() =>
            setConfirmation({
              label: owner
                ? `Permanently delete ${detail.server.name}, its channels and all messages?`
                : `Leave ${detail.server.name}? You will need a new invite to return.`,
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
}: {
  api: CommunityClient;
  user: Account;
  onClose(): void;
  onLogout(): Promise<void>;
}) {
  const [currentPassword, setCurrent] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <Modal title="Your account" onClose={onClose}>
      <div className="account-identity">
        <span className="account-avatar" aria-hidden="true">
          {user.displayName.slice(0, 2).toUpperCase()}
        </span>
        <div>
          <strong>{user.displayName}</strong>
          <span>@{user.username}</span>
        </div>
        <span className="account-badge">Signed in</span>
      </div>
      <section className="account-security">
        <div className="section-heading">
          <LockKeyhole size={18} aria-hidden="true" />
          <div>
            <h3>Password & security</h3>
            <p>Use a unique password to keep your rooms private.</p>
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
          <div className="form-field">
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
          <div className="form-actions">
            <button className="primary-action" disabled={busy}>
              {busy ? 'Please wait…' : 'Change password'}
            </button>
          </div>
        </form>
        {message && <p role="status">{message}</p>}
      </section>
      <footer className="account-session">
        <div>
          <strong>This device</strong>
          <small>Sign out of Pulse Room on this computer.</small>
        </div>
        <button
          disabled={busy}
          className="danger-action"
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
