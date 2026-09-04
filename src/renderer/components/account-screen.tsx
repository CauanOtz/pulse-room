import { useState, type FormEvent } from 'react';
import type { AccountSession } from '../../shared/community';
import type { CommunityClient } from '../infrastructure/community-client';

export function AccountScreen({
  api,
  onAuthenticated,
}: {
  api: CommunityClient;
  onAuthenticated(session: AccountSession): void;
}) {
  const [mode, setMode] = useState<'login' | 'register' | 'recover'>('login');
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [recoveryCode, setRecoveryCode] = useState('');
  const [newRecovery, setNewRecovery] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      if (mode === 'recover') {
        const result = await api.request<{ recoveryCode: string }>('/api/auth/recover', 'POST', {
          username,
          recoveryCode,
          password,
        });
        setNewRecovery(result.recoveryCode);
        setPassword('');
        setRecoveryCode('');
      } else {
        const result = await api.request<AccountSession>(`/api/auth/${mode}`, 'POST', {
          username,
          password,
          ...(mode === 'register' ? { displayName } : {}),
        });
        setPassword('');
        onAuthenticated(result);
      }
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : 'Unable to sign in.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <main className="account-screen grid h-full grid-cols-1 overflow-auto lg:grid-cols-2">
      <div className="account-story hidden flex-col justify-center bg-sidebar p-[clamp(2.5rem,7vw,6rem)] lg:flex">
        <div className="brand-mark grid size-11 shrink-0 place-items-center rounded-2xl bg-primary text-lg font-bold text-primary-foreground">P</div>
        <h1>
          Your people.
          <br />
          Your rooms.
        </h1>
        <p>A place for the whole squad. And a quiet one just for two.</p>
        <div className="account-room mt-6 flex items-center gap-3.5 text-xs text-muted-foreground">
          <span>FR</span>
          <div>
            <strong>Friends</strong>
            <small>Late games, good company</small>
          </div>
        </div>
        <div className="account-room mt-6 flex items-center gap-3.5 text-xs text-muted-foreground">
          <span>US</span>
          <div>
            <strong>Just us</strong>
            <small>Only the people you invite</small>
          </div>
        </div>
      </div>
      <section className="account-form flex flex-col justify-center gap-4 p-[clamp(1.5rem,5vw,4rem)]">
        <h2>
          {mode === 'login'
            ? 'Welcome back'
            : mode === 'register'
              ? 'Make yourself at home'
              : 'Recover your account'}
        </h2>
        <p>
          {mode === 'recover'
            ? 'Use the recovery code you saved when creating your account.'
            : 'Your servers are private. Only invited members can enter.'}
        </p>
        {newRecovery ? (
          <>
            <p>Password changed. Save this replacement recovery code; the old code no longer works.</p>
            <textarea aria-label="New recovery code" readOnly value={newRecovery} />
            <button
              className="primary-action inline-flex h-9 items-center justify-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
              onClick={() => {
                setNewRecovery('');
                setMode('login');
              }}
            >
              I saved it — sign in
            </button>
          </>
        ) : (
          <form onSubmit={(e) => void submit(e)}>
            <label>
              Username
              <input
                autoFocus
                autoComplete="username"
                required
                pattern="[a-zA-Z0-9_]{3,32}"
                maxLength={32}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
            </label>
            {mode === 'register' && (
              <label>
                Display name
                <input
                  required
                  maxLength={40}
                  autoComplete="nickname"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                />
              </label>
            )}
            {mode === 'recover' && (
              <label>
                Recovery code
                <input
                  required
                  autoComplete="off"
                  value={recoveryCode}
                  onChange={(e) => setRecoveryCode(e.target.value)}
                />
              </label>
            )}
            <label>
              {mode === 'recover' ? 'New password' : 'Password'}
              <input
                type="password"
                required
                minLength={mode === 'login' ? 1 : 12}
                maxLength={128}
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
            {mode !== 'login' && (
              <small className="text-[11px] text-muted-foreground">
                Use at least 12 characters. A memorable passphrase works well.
              </small>
            )}
            {error && (
              <p
                role="alert"
                className="form-error rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive"
              >
                {error}
              </p>
            )}
            <button
              className="primary-action mt-1 inline-flex h-9 items-center justify-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50"
              disabled={busy}
            >
              {busy
                ? 'Please wait…'
                : mode === 'login'
                  ? 'Sign in'
                  : mode === 'register'
                    ? 'Create account'
                    : 'Reset password'}
            </button>
          </form>
        )}
        {!newRecovery && (
          <div className="account-links flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            <button
              disabled={busy}
              onClick={() => {
                setMode(mode === 'register' ? 'login' : 'register');
                setError('');
              }}
            >
              {mode === 'register' ? 'Already have an account? Sign in' : 'Create an account'}
            </button>
            <button
              disabled={busy}
              onClick={() => {
                setMode(mode === 'recover' ? 'login' : 'recover');
                setError('');
              }}
            >
              {mode === 'recover' ? 'Back to sign in' : 'Forgot password?'}
            </button>
          </div>
        )}
      </section>
    </main>
  );
}
