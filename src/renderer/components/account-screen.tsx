import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { AnimatePresence, motion, useAnimationControls, useReducedMotion } from 'motion/react';
import { ArrowRight, LoaderCircle, Moon, Sun } from 'lucide-react';
import logoUrl from '../../../assets/logo-ui.png';
import type { AccountSession } from '../../shared/community';
import type { CommunityClient } from '../infrastructure/community-client';
import { FluxField } from './flux-field';
import { BlurText } from './motion/blur-text';
import { Magnetic } from './motion/magnetic';
import { resolveTheme, readTheme, switchTheme } from './theme';

const ease = [0.16, 1, 0.3, 1] as const;

const headings = {
  login: 'Welcome back',
  register: 'Make yourself at home',
  recover: 'Recover your account',
};

/** Fields that come and go with the mode open their own room in the form. */
function Reveal({ show, children }: { show: boolean; children: ReactNode }) {
  return (
    <AnimatePresence initial={false}>
      {show && (
        <motion.div
          className="auth-reveal"
          initial={{ height: 0, opacity: 0, filter: 'blur(6px)' }}
          animate={{ height: 'auto', opacity: 1, filter: 'blur(0px)' }}
          exit={{ height: 0, opacity: 0, filter: 'blur(6px)' }}
          transition={{ duration: 0.42, ease }}
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

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
  const [leaving, setLeaving] = useState(false);
  const [inviteCode, setInviteCode] = useState('');
  const [light, setLight] = useState(() => resolveTheme(readTheme()) === 'light');
  const still = useReducedMotion();
  const panel = useAnimationControls();
  const mounted = useRef(true);
  useEffect(() => {
    // Set on every mount: development mounts effects twice, and a flag only
    // ever cleared would leave the sign-in waiting forever.
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  // Whether new accounts can be made here: open, only with a code, or not at all.
  const [registration, setRegistration] = useState<'open' | 'invite' | 'closed'>('open');
  useEffect(() => {
    if (mode !== 'register') return;
    let current = true;
    api
      .request<{ mode: 'open' | 'invite' | 'closed' }>('/api/auth/registration')
      .then((result) => current && setRegistration(result.mode))
      // An older server has no such question, and was always open.
      .catch(() => current && setRegistration('open'));
    return () => {
      current = false;
    };
  }, [api, mode]);
  const closed = mode === 'register' && registration === 'closed';

  const switchMode = (next: typeof mode) => {
    setMode(next);
    setError('');
  };

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
          ...(mode === 'register' && registration === 'invite' ? { inviteCode } : {}),
        });
        setPassword('');
        // The way in is a moment: the panel dissolves into the field first.
        if (!still) {
          setLeaving(true);
          await new Promise((resolve) => setTimeout(resolve, 560));
        }
        if (mounted.current) onAuthenticated(result);
      }
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : 'Unable to sign in.');
      if (!still)
        void panel.start({ x: [0, -9, 8, -6, 4, -2, 0], transition: { duration: 0.5, ease: 'easeOut' } });
    } finally {
      if (mounted.current) setBusy(false);
    }
  };

  const label = busy
    ? 'Please wait…'
    : mode === 'login'
      ? 'Sign in'
      : mode === 'register'
        ? 'Create account'
        : 'Reset password';

  return (
    <main className="auth-screen" data-leaving={leaving || undefined}>
      <FluxField className="auth-field" intensity={leaving ? 1.35 : 1} resolution={0.8} />
      <div className="auth-veil" aria-hidden="true" />

      <motion.header
        className="auth-top"
        initial={still ? false : { opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, delay: 0.1, ease }}
      >
        <span className="auth-brand">
          <img src={logoUrl} alt="" />
          <span>Pulse Room</span>
        </span>
        <button
          type="button"
          className="auth-theme"
          aria-label={light ? 'Use the dark theme' : 'Use the light theme'}
          onClick={(event) => {
            const next = light ? 'dark' : 'light';
            setLight(!light);
            switchTheme(next, { x: event.clientX, y: event.clientY });
          }}
        >
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.span
              key={light ? 'moon' : 'sun'}
              initial={{ opacity: 0, scale: 0.4, rotate: -90, filter: 'blur(4px)' }}
              animate={{ opacity: 1, scale: 1, rotate: 0, filter: 'blur(0px)' }}
              exit={{ opacity: 0, scale: 0.4, rotate: 90, filter: 'blur(4px)' }}
              transition={{ duration: 0.45, ease }}
              className="grid place-items-center"
            >
              {light ? <Moon className="size-4" /> : <Sun className="size-4" />}
            </motion.span>
          </AnimatePresence>
        </button>
      </motion.header>

      <section className="auth-story" aria-label="Pulse Room">
        <h1>
          <BlurText
            label="Your people. Your rooms."
            delay={0.25}
            parts={['Your', 'people.', '\n', 'Your', <em key="rooms">rooms.</em>]}
          />
        </h1>
        <motion.p
          initial={still ? false : { opacity: 0, y: 10, filter: 'blur(8px)' }}
          animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
          transition={{ duration: 0.9, delay: 0.75, ease }}
        >
          Voice that stays out of the way, screens in full 1080p with their sound, and servers only your
          people can enter.
        </motion.p>
      </section>

      <motion.section
        className="auth-panel"
        initial={still ? false : { opacity: 0, y: 28, scale: 0.97, filter: 'blur(12px)' }}
        animate={
          leaving
            ? { opacity: 0, y: -8, scale: 1.04, filter: 'blur(16px)' }
            : { opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' }
        }
        transition={{ duration: leaving ? 0.55 : 1, delay: leaving ? 0 : 0.35, ease }}
      >
        <motion.div className="auth-card" animate={panel}>
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={newRecovery ? 'saved' : mode}
              className="auth-heading"
              initial={{ opacity: 0, y: 8, filter: 'blur(8px)' }}
              animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
              exit={{ opacity: 0, y: -6, filter: 'blur(8px)' }}
              transition={{ duration: 0.32, ease }}
            >
              <h2>{headings[mode]}</h2>
              <p>
                {mode === 'recover'
                  ? 'Use the recovery code you saved when creating your account.'
                  : 'Your servers are private. Only invited members can enter.'}
              </p>
            </motion.div>
          </AnimatePresence>

          {newRecovery ? (
            <motion.div
              className="auth-form"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, ease }}
            >
              <p className="auth-note">
                Password changed. Save this replacement recovery code; the old code no longer works.
              </p>
              <textarea aria-label="New recovery code" readOnly value={newRecovery} />
              <button
                className="auth-submit"
                onClick={() => {
                  setNewRecovery('');
                  setMode('login');
                }}
              >
                <span className="auth-submit-label">I saved it — sign in</span>
                <ArrowRight className="auth-submit-arrow" aria-hidden="true" />
              </button>
            </motion.div>
          ) : (
            <form className="auth-form" onSubmit={(e) => void submit(e)}>
              <label className="auth-input">
                <span>Username</span>
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
              <Reveal show={mode === 'register'}>
                <label className="auth-input">
                  <span>Display name</span>
                  <input
                    required
                    maxLength={40}
                    autoComplete="nickname"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                  />
                </label>
              </Reveal>
              <Reveal show={mode === 'register' && registration === 'invite'}>
                <label className="auth-input">
                  <span>Invite code</span>
                  <input
                    required
                    autoComplete="off"
                    maxLength={64}
                    value={inviteCode}
                    onChange={(e) => setInviteCode(e.target.value)}
                  />
                </label>
              </Reveal>
              <Reveal show={closed}>
                <p role="status" className="auth-note">
                  Sign-ups are closed right now. Ask whoever runs this Pulse Room for an account.
                </p>
              </Reveal>
              <Reveal show={mode === 'recover'}>
                <label className="auth-input">
                  <span>Recovery code</span>
                  <input
                    required
                    autoComplete="off"
                    value={recoveryCode}
                    onChange={(e) => setRecoveryCode(e.target.value)}
                  />
                </label>
              </Reveal>
              <label className="auth-input">
                <span>{mode === 'recover' ? 'New password' : 'Password'}</span>
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
              <Reveal show={mode !== 'login'}>
                <small className="auth-hint">
                  Use at least 12 characters. A memorable passphrase works well.
                </small>
              </Reveal>
              <Reveal show={Boolean(error)}>
                <p role="alert" className="auth-error">
                  {error}
                </p>
              </Reveal>
              <Magnetic strength={0.12} className="mt-1">
                <button className="auth-submit" disabled={busy || closed} data-busy={busy || undefined}>
                  <AnimatePresence mode="popLayout" initial={false}>
                    <motion.span
                      key={label}
                      className="auth-submit-label"
                      initial={{ opacity: 0, y: 10, filter: 'blur(4px)' }}
                      animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                      exit={{ opacity: 0, y: -10, filter: 'blur(4px)' }}
                      transition={{ duration: 0.28, ease }}
                    >
                      {label}
                    </motion.span>
                  </AnimatePresence>
                  {busy ? (
                    <LoaderCircle className="auth-submit-arrow animate-spin" aria-hidden="true" />
                  ) : (
                    <ArrowRight className="auth-submit-arrow" aria-hidden="true" />
                  )}
                </button>
              </Magnetic>
            </form>
          )}
          {!newRecovery && (
            <div className="auth-links">
              <button disabled={busy} onClick={() => switchMode(mode === 'register' ? 'login' : 'register')}>
                {mode === 'register' ? 'Already have an account? Sign in' : 'Create an account'}
              </button>
              <button disabled={busy} onClick={() => switchMode(mode === 'recover' ? 'login' : 'recover')}>
                {mode === 'recover' ? 'Back to sign in' : 'Forgot password?'}
              </button>
            </div>
          )}
        </motion.div>
      </motion.section>

      <motion.footer
        className="auth-foot"
        initial={still ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 1.2, delay: 1.1 }}
      >
        <span>Move the pointer to bend the field</span>
        <span className="font-mono">v{__APP_VERSION__}</span>
      </motion.footer>
    </main>
  );
}
