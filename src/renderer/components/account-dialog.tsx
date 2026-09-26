import { useEffect, useState, type ReactNode } from 'react';
import { LogOut, Palette, ShieldCheck, UserRound, type LucideIcon } from 'lucide-react';
import type { Account, ProfileTheme } from '../../shared/community';
import type { CommunityClient } from '../infrastructure/community-client';
import { ConfirmDialog, type Confirmation } from './confirm-dialog';
import { Modal } from './modal';
import { PictureField } from './picture-field';
import { BannerField, ProfilePreview, sameTheme, TagWearer, ThemeEditor } from './profile-editors';
import { cn } from './ui/utils';

const errorMessage = (error: unknown) => (error instanceof Error ? error.message : 'Something went wrong.');

type Section = 'profile' | 'personalization' | 'security';

const sections: { id: Section; label: string; icon: LucideIcon; description: string }[] = [
  { id: 'profile', label: 'Profile', icon: UserRound, description: 'How you appear to the people in your servers.' },
  {
    id: 'personalization',
    label: 'Personalization',
    icon: Palette,
    description: 'The colours your profile card is painted in.',
  },
  { id: 'security', label: 'Security', icon: ShieldCheck, description: 'Your password, and this device.' },
];

const primaryClass =
  'primary-action inline-flex h-9 items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50';

/** A part of a section, headed the way the rest of the settings are. */
function Part({ id, title, hint, children }: { id: string; title: string; hint?: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="space-y-3">
      <div className="space-y-1">
        <h3 id={id} className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
          {title}
        </h3>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </div>
      {children}
    </section>
  );
}

/**
 * Everything about you, in three places rather than one long page.
 *
 * The side stays put and only the section scrolls, so the way back to any part
 * of it is always on screen. A picture, a banner and a tag are kept the moment
 * they are chosen, because each of them already asked for confirmation on the
 * way in. The bio and the colours are written and tried, so they wait: every
 * pending change is saved together from the bar at the foot, and closing with
 * one pending asks before throwing it away.
 */
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
  const [section, setSection] = useState<Section>('profile');
  const [confirmation, setConfirmation] = useState<Confirmation>();

  // ---------------------------------------------------------- pending changes
  const savedBio = user.bio ?? '';
  const savedTheme = user.theme ?? null;
  const [bio, setBio] = useState(savedBio);
  const [theme, setTheme] = useState<ProfileTheme | null>(savedTheme);
  // Refreshed from the service after a picture is saved too, so these follow
  // the stored values rather than the object, or a new face would wipe a
  // colour that was still being tried.
  const savedThemeKey = JSON.stringify(savedTheme);
  useEffect(() => setBio(savedBio), [savedBio]);
  useEffect(() => setTheme(savedTheme), [savedThemeKey]);

  const bioChanged = bio.trim() !== savedBio;
  const themeChanged = !sameTheme(theme, savedTheme);
  const dirty = bioChanged || themeChanged;
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState('');

  const save = async () => {
    setSaving(true);
    setSaveMessage('');
    try {
      if (bioChanged) await api.request('/api/account/profile', 'PATCH', { bio: bio.trim() });
      if (themeChanged) await api.request('/api/account/theme', 'PATCH', { theme });
      await onProfileChanged();
      setSaveMessage('Changes saved.');
    } catch (error) {
      setSaveMessage(errorMessage(error));
    } finally {
      setSaving(false);
    }
  };
  const reset = () => {
    setBio(savedBio);
    setTheme(savedTheme);
    setSaveMessage('');
  };
  const close = () => {
    if (!dirty) {
      onClose();
      return;
    }
    setConfirmation({
      title: 'Discard your changes?',
      description: 'Your bio or your colours have changes that are not saved yet.',
      confirmLabel: 'Discard',
      tone: 'danger',
      action: async () => onClose(),
    });
  };

  // --------------------------------------------------------------- security
  const [currentPassword, setCurrent] = useState('');
  const [password, setPassword] = useState('');
  const [securityMessage, setSecurityMessage] = useState('');
  const [securityBusy, setSecurityBusy] = useState(false);

  const current = sections.find((entry) => entry.id === section)!;

  return (
    <Modal
      title="Your account"
      onClose={close}
      contentClassName="account-workspace-modal h-[min(42rem,calc(100vh-2rem))] max-h-none w-[min(56rem,calc(100vw-2rem))]"
      headerClassName="h-15 px-6 py-0"
      bodyClassName="flex min-h-0 flex-col space-y-0 overflow-hidden p-0"
    >
      <div className="grid min-h-0 flex-1 grid-cols-[12rem_minmax(0,1fr)]">
        <aside className="flex min-h-0 flex-col border-r border-border bg-background/45 p-3">
          <div className="px-2 pb-3 pt-1">
            <span className="text-[11px] font-medium text-muted-foreground">Account</span>
          </div>
          <nav className="flex flex-col gap-1" aria-label="Account sections">
            {sections.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                type="button"
                className={cn(
                  'flex h-9 items-center gap-2.5 rounded-md px-2.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  section === id
                    ? 'bg-accent text-foreground'
                    : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground',
                )}
                aria-pressed={section === id}
                onClick={() => setSection(id)}
              >
                <Icon className="size-4" aria-hidden="true" /> {label}
                {/* A section with something unsaved in it says so from here. */}
                {((id === 'profile' && bioChanged) || (id === 'personalization' && themeChanged)) && (
                  <span className="ml-auto size-1.5 rounded-full bg-foreground" aria-label="Unsaved changes" />
                )}
              </button>
            ))}
          </nav>
        </aside>

        <section className="flex min-h-0 min-w-0 flex-col" aria-label={current.label}>
          <div className="min-h-0 flex-1 overflow-y-auto">
            <header className="sticky top-0 z-10 border-b border-border bg-card px-6 py-4">
              <h2 className="text-base font-semibold text-foreground">{current.label}</h2>
              <p className="mt-1 max-w-xl text-xs leading-5 text-muted-foreground">{current.description}</p>
            </header>

            <div className="account-workspace-content space-y-7 px-6 py-5">
              {section === 'profile' && (
                <>
                  <div className="max-w-[20rem]">
                    <ProfilePreview user={user} theme={theme} bio={bio} />
                  </div>
                  <Part id="account-avatar-heading" title="Avatar">
                    <PictureField
                      name={user.displayName}
                      imageId={user.avatarId}
                      username={user.username}
                      statusLabel="Signed in"
                      variant="identity"
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
                  </Part>
                  <BannerField
                    user={user}
                    theme={theme}
                    onChoose={async (image) => {
                      await api.upload('/api/account/banner', image);
                      await onProfileChanged();
                    }}
                    onRemove={async () => {
                      await api.request('/api/account/banner', 'DELETE');
                      await onProfileChanged();
                    }}
                  />
                  <TagWearer api={api} user={user} onChanged={onProfileChanged} />
                  <Part
                    id="account-bio-heading"
                    title="About me"
                    hint="A short bio shown on your profile to people in your servers."
                  >
                    <label className="form-field flex flex-col gap-1.5 text-xs font-medium text-muted-foreground">
                      <span className="sr-only">Bio</span>
                      <textarea
                        aria-label="Bio"
                        rows={3}
                        maxLength={200}
                        placeholder="A little about you…"
                        value={bio}
                        onChange={(event) => {
                          setBio(event.target.value);
                          setSaveMessage('');
                        }}
                        className="resize-y"
                      />
                    </label>
                    <small className="block text-right text-[11px] text-muted-foreground">{bio.length} / 200</small>
                  </Part>
                </>
              )}

              {section === 'personalization' && (
                // The card sits beside the colours, where the eye already is.
                <div className="grid items-start gap-6 md:grid-cols-[minmax(0,1fr)_17rem]">
                  <ThemeEditor
                    value={theme}
                    saved={savedTheme}
                    onChange={(next) => {
                      setTheme(next);
                      setSaveMessage('');
                    }}
                  />
                  <div className="md:sticky md:top-24">
                    <ProfilePreview user={user} theme={theme} bio={bio} />
                  </div>
                </div>
              )}

              {section === 'security' && (
                <>
                  <Part
                    id="account-password-heading"
                    title="Password & security"
                    hint="Use a unique password to keep your rooms private."
                  >
                    <form
                      className="account-security max-w-md"
                      onSubmit={(event) => {
                        event.preventDefault();
                        setSecurityBusy(true);
                        setSecurityMessage('');
                        void api
                          .request('/api/auth/password', 'POST', { currentPassword, password })
                          .then(() => {
                            setCurrent('');
                            setPassword('');
                            setSecurityMessage('Password changed. Other sessions were signed out.');
                          })
                          .catch((error) => setSecurityMessage(errorMessage(error)))
                          .finally(() => setSecurityBusy(false));
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
                          onChange={(event) => setCurrent(event.target.value)}
                        />
                      </label>
                      <label>
                        New password
                        <input
                          type="password"
                          autoComplete="new-password"
                          required
                          minLength={12}
                          maxLength={128}
                          value={password}
                          onChange={(event) => setPassword(event.target.value)}
                          aria-describedby="password-hint"
                        />
                      </label>
                      <div className="form-actions flex flex-wrap items-center justify-between gap-2 pt-0.5">
                        <small id="password-hint">At least 12 characters. Other devices will be signed out.</small>
                        <button className={primaryClass} disabled={securityBusy}>
                          {securityBusy ? 'Please wait…' : 'Change password'}
                        </button>
                      </div>
                    </form>
                    {securityMessage && (
                      <p
                        className="max-w-md rounded-md border border-border/70 bg-background/55 px-3 py-2 text-xs text-muted-foreground"
                        role="status"
                      >
                        {securityMessage}
                      </p>
                    )}
                  </Part>
                  <div className="account-session flex max-w-md flex-wrap items-center justify-between gap-3 border-t border-border/70 pt-5">
                    <div className="flex min-w-0 flex-col gap-1">
                      <strong className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                        This device
                      </strong>
                      <small className="text-xs text-muted-foreground">Signed in on Pulse Room on this computer.</small>
                    </div>
                    <button
                      disabled={securityBusy}
                      className="danger-action inline-flex h-8 items-center justify-center gap-2 rounded-md border border-transparent bg-transparent px-3 text-xs font-medium text-muted-foreground transition-colors hover:border-destructive/35 hover:bg-destructive/10 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50"
                      onClick={() => {
                        setSecurityBusy(true);
                        void onLogout().catch((error) => {
                          setSecurityMessage(errorMessage(error));
                          setSecurityBusy(false);
                        });
                      }}
                    >
                      <LogOut size={15} aria-hidden="true" /> Sign out
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* The one place pending changes are kept from, pinned under whatever
              section is open so it is never scrolled out of reach. */}
          {(dirty || saveMessage) && (
            <div
              className="unsaved-bar flex flex-wrap items-center gap-3 border-t border-border bg-card px-6 py-3"
              role="region"
              aria-label="Unsaved changes"
            >
              <span className="min-w-0 flex-1 text-xs text-muted-foreground" role="status">
                {dirty ? "Changes you've made aren't saved yet." : saveMessage}
              </span>
              {dirty && (
                <>
                  {saveMessage && (
                    <span className="text-xs text-destructive" role="alert">
                      {saveMessage}
                    </span>
                  )}
                  <button
                    type="button"
                    className="inline-flex h-8 items-center rounded-md px-3 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    disabled={saving}
                    onClick={reset}
                  >
                    Reset
                  </button>
                  <button type="button" className={cn(primaryClass, 'h-8 px-3.5 text-xs')} disabled={saving} onClick={() => void save()}>
                    {saving ? 'Saving…' : 'Save changes'}
                  </button>
                </>
              )}
            </div>
          )}
        </section>
      </div>
      {confirmation && (
        <ConfirmDialog
          confirmation={confirmation}
          onCancel={() => setConfirmation(undefined)}
          onConfirm={() => void confirmation.action()}
        />
      )}
    </Modal>
  );
}
