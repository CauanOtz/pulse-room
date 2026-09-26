import { useState, type FormEvent } from 'react';
import type { Community } from '../../shared/community';
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

// The channel, category and server settings live in files of their own.
export { CategoryDialog, ChannelDialog } from './channel-dialogs';
export { ServerDialog } from './server-dialog';

// The account settings live in a file of their own; imported from here as before.
export { AccountDialog } from './account-dialog';
