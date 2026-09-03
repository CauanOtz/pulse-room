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
    <main className="account-screen">
      <div className="account-story">
        <div className="brand-mark">P</div>
        <h1>
          Your people.
          <br />
          Your rooms.
        </h1>
        <p>A place for the whole squad. And a quiet one just for two.</p>
        <div className="account-room">
          <span>FR</span>
          <div>
            <strong>Friends</strong>
            <small>Late games, good company</small>
          </div>
        </div>
        <div className="account-room">
          <span>US</span>
          <div>
            <strong>Just us</strong>
            <small>Only the people you invite</small>
          </div>
        </div>
      </div>
      <section className="account-form">
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
              className="primary-action"
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
              <small>Use at least 12 characters. A memorable passphrase works well.</small>
            )}
            {error && (
              <p role="alert" className="form-error">
                {error}
              </p>
            )}
            <button className="primary-action" disabled={busy}>
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
          <div className="account-links">
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
