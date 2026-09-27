import { useEffect, useId, useRef, useState } from 'react';
import { ImageUp, Trash2 } from 'lucide-react';
import { colourPattern, type Account, type ProfileTheme, type TagChoice } from '../../shared/community';
import type { CommunityClient } from '../infrastructure/community-client';
import { acceptedTypes, maxSourceBytes } from '../infrastructure/prepare-image';
import { Avatar } from './avatar';
import { ImageCropDialog } from './image-crop-dialog';
import { ProfileBanner, TagChip, themedCard } from './profile-identity';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { cn } from './ui/utils';

const errorMessage = (error: unknown) => (error instanceof Error ? error.message : 'That could not be saved.');

const buttonClass =
  'inline-flex h-8 items-center justify-center gap-2 rounded-md border border-border bg-transparent px-3 text-xs font-medium text-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50';
const primaryClass =
  'primary-action inline-flex h-8 items-center justify-center rounded-md bg-primary px-3.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50';

/**
 * Colours that read well on a dark card, offered first so that picking a good
 * one takes a click. Anything else is one step away in the full picker.
 */
export const colourPresets = [
  '#e0452b',
  '#f08a24',
  '#f2c230',
  '#45cf8a',
  '#2bb5a8',
  '#3b82f6',
  '#6a5acd',
  '#b45cd6',
  '#e8508a',
  '#9ca3af',
];

/** A section heading in the same voice as the rest of the settings. */
function Heading({ id, title, hint }: { id: string; title: string; hint: string }) {
  return (
    <div className="space-y-1">
      <h3 id={id} className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
        {title}
      </h3>
      <p className="text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}

/**
 * One colour, chosen from a handful that work or from anywhere at all. The
 * text field accepts what somebody pastes, and only a real colour gets through.
 */
export function ColourField({
  label,
  value,
  disabled,
  onChange,
}: {
  label: string;
  value: string;
  disabled?: boolean;
  onChange(colour: string): void;
}) {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  const id = useId();

  return (
    <div className="colour-field space-y-2" role="group" aria-labelledby={`${id}-label`}>
      <div className="flex items-center gap-2">
        <span id={`${id}-label`} className="min-w-0 flex-1 text-xs font-medium text-foreground">
          {label}
        </span>
        <label className="relative size-7 shrink-0 cursor-pointer overflow-hidden rounded-md border border-border">
          <span className="absolute inset-0" style={{ background: value }} aria-hidden="true" />
          <input
            className="absolute inset-0 size-full cursor-pointer opacity-0"
            type="color"
            value={value}
            disabled={disabled}
            aria-label={`${label}, full picker`}
            onChange={(event) => onChange(event.target.value.toLowerCase())}
          />
        </label>
        <input
          className="h-7 w-[5.5rem] rounded-md border border-input bg-background px-2 font-mono text-[11px] uppercase"
          value={text}
          maxLength={7}
          disabled={disabled}
          aria-label={`${label}, hex`}
          spellCheck={false}
          onChange={(event) => {
            const next = event.target.value.trim();
            setText(next);
            const normalised = (next.startsWith('#') ? next : `#${next}`).toLowerCase();
            if (colourPattern.test(normalised)) onChange(normalised);
          }}
          onBlur={() => setText(value)}
        />
      </div>
      <div className="flex flex-wrap gap-1.5">
        {colourPresets.map((preset) => (
          <button
            key={preset}
            type="button"
            className={cn(
              'size-5 rounded-full border border-black/30 transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none',
              preset === value && 'ring-2 ring-foreground ring-offset-2 ring-offset-popover',
            )}
            style={{ background: preset }}
            disabled={disabled}
            aria-label={`${label}: ${preset}`}
            aria-pressed={preset === value}
            onClick={() => onChange(preset)}
          />
        ))}
      </div>
    </div>
  );
}

/**
 * A small copy of the card other people will see, redrawn as settings change.
 * The popover itself is what it imitates: banner, face, name, tag.
 */
export function ProfilePreview({
  user,
  theme,
  bio = user.bio,
}: {
  user: Account;
  theme: ProfileTheme | null;
  /** The bio as it is being written, rather than as it was last saved. */
  bio?: string;
}) {
  return (
    <div
      className="profile-preview overflow-hidden rounded-xl border border-border bg-popover"
      style={themedCard(theme)}
      data-themed={theme ? 'true' : undefined}
      aria-label="Profile preview"
      role="img"
    >
      <ProfileBanner bannerId={user.bannerId} theme={theme} className="aspect-[5/2] w-full" />
      <div className="px-3.5 pb-3">
        <Avatar
          className="-mt-6 grid size-12 place-items-center rounded-full border-[3px] border-[color:var(--card-surface,var(--popover))] bg-secondary text-xs font-bold text-secondary-foreground"
          name={user.displayName}
          imageId={user.avatarId}
          animate="always"
        />
        <div className="mt-1.5 flex min-w-0 items-center gap-1.5">
          <strong className="truncate text-sm font-semibold">{user.displayName}</strong>
          {user.tag && <TagChip tag={user.tag} size="xs" />}
        </div>
        <p className="truncate text-[11px] text-muted-foreground">@{user.username}</p>
        {bio?.trim() && (
          <p className="mt-2 line-clamp-2 whitespace-pre-wrap break-words text-[11.5px] leading-snug text-foreground/85">
            {bio.trim()}
          </p>
        )}
      </div>
    </div>
  );
}

/** The wide picture across the top of the card, framed the same way a face is. */
export function BannerField({
  user,
  theme,
  onChoose,
  onRemove,
}: {
  user: Account;
  theme: ProfileTheme | null;
  onChoose(image: Blob): Promise<void>;
  onRemove(): Promise<void>;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string>();
  const [editing, setEditing] = useState<File>();

  const remove = async () => {
    setBusy(true);
    setProblem(undefined);
    try {
      await onRemove();
    } catch (error) {
      setProblem(errorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section aria-labelledby="account-banner-heading" className="banner-field space-y-3">
      <Heading
        id="account-banner-heading"
        title="Banner"
        hint="A wide picture across the top of your profile. Without one, your colours stand in."
      />
      <ProfileBanner
        bannerId={user.bannerId}
        theme={theme}
        className="aspect-[5/2] w-full max-w-[26rem] rounded-lg border border-border"
      />
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className={buttonClass} disabled={busy} onClick={() => input.current?.click()}>
          <ImageUp size={15} /> {user.bannerId ? 'Change banner' : 'Add banner'}
        </button>
        {user.bannerId && (
          <button type="button" className={cn(buttonClass, 'text-muted-foreground')} disabled={busy} onClick={() => void remove()}>
            <Trash2 size={15} /> Remove banner
          </button>
        )}
      </div>
      {problem ? (
        <small className="block rounded-md bg-destructive/10 px-2 py-1 text-xs font-medium text-destructive" role="alert">
          {problem}
        </small>
      ) : (
        <small className="block text-[11px] text-muted-foreground">
          PNG, JPEG, WebP or GIF · Max 15 MB. A GIF keeps moving.
        </small>
      )}
      <input
        ref={input}
        className="pointer-events-none absolute size-px opacity-0"
        type="file"
        accept={acceptedTypes.join(',')}
        aria-label="Choose a banner"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = '';
          if (!file) return;
          if (!acceptedTypes.includes(file.type)) {
            setProblem('Choose a PNG, JPEG, WebP or GIF picture.');
            return;
          }
          if (file.size > maxSourceBytes) {
            setProblem('Choose an image smaller than 15 MB.');
            return;
          }
          setProblem(undefined);
          setEditing(file);
        }}
      />
      {editing && (
        <ImageCropDialog
          file={editing}
          title="Banner"
          kind="banner"
          onClose={() => setEditing(undefined)}
          onSave={async (image) => {
            await onChoose(image);
            setEditing(undefined);
          }}
        />
      )}
    </section>
  );
}

export const defaultTheme: ProfileTheme = { primary: '#6a5acd', accent: '#e8508a' };

/** Whether two themes paint the same card. */
export const sameTheme = (a: ProfileTheme | null, b: ProfileTheme | null): boolean =>
  a === b || (!!a && !!b && a.primary === b.primary && a.accent === b.accent);

/**
 * The two colours a profile is painted in. Nothing here is kept on its own:
 * the dialog that holds it saves every pending change together, so trying a
 * colour costs nothing and the preview beside it shows the result at once.
 */
export function ThemeEditor({
  value,
  saved,
  onChange,
}: {
  /** What is being tried right now. */
  value: ProfileTheme | null;
  /** What the service holds, for switching the colours back on. */
  saved: ProfileTheme | null;
  onChange(theme: ProfileTheme | null): void;
}) {
  return (
    <section aria-labelledby="account-theme-heading" className="theme-editor space-y-3">
      <Heading
        id="account-theme-heading"
        title="Profile colours"
        hint="Paint your profile card. Everybody who shares a server with you sees it."
      />
      <label className="flex flex-row items-center gap-2 text-xs font-medium text-foreground">
        <input
          type="checkbox"
          className="size-4 accent-foreground"
          checked={value !== null}
          onChange={(event) => onChange(event.target.checked ? (saved ?? defaultTheme) : null)}
        />
        Use my own colours
      </label>
      {/* The two colours stay in view with the switch off, dimmed, so what
          it does is plain before it is turned on. */}
      <div className={cn('grid max-w-md gap-4 transition-opacity', !value && 'pointer-events-none opacity-45')} aria-disabled={!value}>
        <ColourField
          label="Primary"
          value={(value ?? saved ?? defaultTheme).primary}
          disabled={!value}
          onChange={(primary) => value && onChange({ ...value, primary })}
        />
        <ColourField
          label="Accent"
          value={(value ?? saved ?? defaultTheme).accent}
          disabled={!value}
          onChange={(accent) => value && onChange({ ...value, accent })}
        />
      </div>
    </section>
  );
}

/**
 * The tag worn in each server, chosen server by server. A server can offer
 * several; you wear one of them there, or none. Only the tags you may wear
 * are offered, so the list is the rule.
 *
 * The choice shows the moment it is made. If the service refuses, it goes
 * back to what it was and says why.
 */
export function TagWearer({ api, onChanged }: { api: CommunityClient; onChanged(): Promise<void> }) {
  const [choices, setChoices] = useState<TagChoice[]>();
  const [busy, setBusy] = useState<string>();
  const [problem, setProblem] = useState('');

  useEffect(() => {
    let current = true;
    void api
      .request<{ choices: TagChoice[] }>('/api/account/tags')
      .then((result) => current && setChoices(result.choices))
      .catch(() => current && setChoices([]));
    return () => {
      current = false;
    };
  }, [api]);

  const wear = async (choice: TagChoice, tagId: string | null) => {
    const before = choice.activeId;
    const set = (activeId: string | null) =>
      setChoices((list) => list?.map((entry) => (entry.serverId === choice.serverId ? { ...entry, activeId } : entry)));
    set(tagId);
    setBusy(choice.serverId);
    setProblem('');
    try {
      await api.request(`/api/servers/${choice.serverId}/worn-tag`, 'PUT', { tagId });
      await onChanged();
    } catch (error) {
      set(before);
      setProblem(errorMessage(error));
    } finally {
      setBusy(undefined);
    }
  };

  return (
    <section aria-labelledby="account-tag-heading" className="tag-wearer space-y-3">
      <Heading id="account-tag-heading" title="Server tags" hint="Choose the tag you wear in each server, beside your name there." />
      {choices === undefined ? (
        <p className="text-xs text-muted-foreground">Looking for tags…</p>
      ) : choices.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          None of your servers offers you a tag yet. Staff can create them in the server settings.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {choices.map((choice) => (
            <li key={choice.serverId} className="grid grid-cols-[minmax(0,11rem)_11rem] items-center gap-3">
              <span className="min-w-0 truncate text-xs font-medium text-foreground">{choice.serverName}</span>
              <Select
                value={choice.activeId ?? none}
                disabled={busy === choice.serverId}
                onValueChange={(value) => void wear(choice, value === none ? null : value)}
              >
                <SelectTrigger className="h-8 w-full" aria-label={`Tag in ${choice.serverName}`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={none}>None</SelectItem>
                  {choice.tags.map((tag) => (
                    <SelectItem key={tag.id} value={tag.id}>
                      <span className="flex items-center gap-2">
                        <TagChip tag={tag} size="xs" />
                        {tag.name && <span className="text-muted-foreground">{tag.name}</span>}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </li>
          ))}
        </ul>
      )}
      {problem && (
        <p className="rounded-md bg-destructive/10 px-2 py-1 text-xs text-destructive" role="alert">
          {problem}
        </p>
      )}
    </section>
  );
}

const none = '__none__';
