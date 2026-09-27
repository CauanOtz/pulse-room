import { useEffect, useState, type ReactNode } from 'react';
import { LogOut, Palette, ShieldCheck, UserRound, type LucideIcon } from 'lucide-react';
import type { Account, ProfileTheme } from '../../shared/community';
import type { CommunityClient } from '../infrastructure/community-client';
import { ConfirmDialog, type Confirmation } from './confirm-dialog';
import { SettingsHeading, SettingsNavButton, SettingsScreen } from './settings-screen';
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
 * What is being edited on the left, and the card it makes on the right. The
 * card stays where it is while the settings scroll past it, so a change made at
 * the bottom is still seen at the top. On a narrow window it comes first.
 */
function EditorWithPreview({ preview, children }: { preview: ReactNode; children: ReactNode }) {
  return (
    <div className="account-editor grid items-start gap-8 md:grid-cols-[minmax(0,1fr)_16.5rem]">
      <div className="min-w-0 space-y-7">{children}</div>
      <aside className="order-first space-y-2 md:sticky md:top-8 md:order-none" aria-label="Live preview">
        <span className="block text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
          Preview
        </span>
        {preview}
      </aside>
    </div>
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
    <SettingsScreen
      title="Account"
      label="Your account"
      onClose={close}
      nav={
        <nav className="flex flex-col gap-0.5" aria-label="Account sections">
          {sections.map(({ id, label, icon }) => (
            <SettingsNavButton key={id} icon={icon} label={label} active={section === id} onClick={() => setSection(id)}>
              {/* A section with something unsaved in it says so from here. */}
              {((id === 'profile' && bioChanged) || (id === 'personalization' && themeChanged)) && (
                <span className="size-1.5 shrink-0 rounded-full bg-foreground" aria-label="Unsaved changes" />
              )}
            </SettingsNavButton>
          ))}
        </nav>
      }
    >
      <section className="flex min-w-0 flex-1 flex-col" aria-label={current.label}>
            <SettingsHeading title={current.label} description={current.description} />
            <div className="account-workspace-content flex-1 space-y-7">
              {section === 'profile' && (
                <EditorWithPreview preview={<ProfilePreview user={user} theme={theme} bio={bio} />}>
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
                  <TagWearer api={api} onChanged={onProfileChanged} />
                  <Part
                    id="account-bio-heading"
                    title="About me"
                    hint="A short bio shown on your profile to people in your servers."
                  >
                    <label className="form-field flex max-w-xl flex-col gap-1.5 text-xs font-medium text-muted-foreground">
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
                    <small className="block max-w-xl text-right text-[11px] text-muted-foreground">{bio.length} / 200</small>
                  </Part>
                </EditorWithPreview>
              )}

              {section === 'personalization' && (
                <EditorWithPreview preview={<ProfilePreview user={user} theme={theme} bio={bio} />}>
                  <ThemeEditor
                    value={theme}
                    saved={savedTheme}
                    onChange={(next) => {
                      setTheme(next);
                      setSaveMessage('');
                    }}
                  />
                </EditorWithPreview>
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
                        <small id="password-hint" className="text-xs font-normal text-muted-foreground">
                          At least 12 characters. Other devices will be signed out.
                        </small>
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

          {/* The one place pending changes are kept from, floating at the foot
              of whatever section is open so it is never scrolled out of reach. */}
          {(dirty || saveMessage) && (
            <div
              className="unsaved-bar sticky bottom-4 z-10 mt-8 flex flex-wrap items-center gap-3 rounded-xl border border-border bg-popover px-4 py-3 shadow-2xl"
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
      {confirmation && (
        <ConfirmDialog
          confirmation={confirmation}
          onCancel={() => setConfirmation(undefined)}
          onConfirm={() => void confirmation.action()}
        />
      )}
    </SettingsScreen>
  );
}
