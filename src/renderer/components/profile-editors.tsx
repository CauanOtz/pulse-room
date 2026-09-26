import { useEffect, useId, useRef, useState } from 'react';
import { ImageUp, Trash2 } from 'lucide-react';
import {
  colourPattern,
  tagBadges,
  tagTextPattern,
  type Account,
  type Community,
  type ProfileTheme,
  type ServerTag,
  type TagBadge,
} from '../../shared/community';
import type { CommunityClient } from '../infrastructure/community-client';
import { acceptedTypes, maxSourceBytes } from '../infrastructure/prepare-image';
import { Avatar } from './avatar';
import { ImageCropDialog } from './image-crop-dialog';
import { badgeIcons, badgeNames, ProfileBanner, TagChip, themedCard } from './profile-identity';
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
          className="-mt-6 grid size-12 place-items-center rounded-full border-[3px] border-popover bg-secondary text-xs font-bold text-secondary-foreground"
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
        className="aspect-[5/2] w-full max-w-[22rem] rounded-lg border border-border"
      />
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className={buttonClass} disabled={busy} onClick={() => input.current?.click()}>
          <ImageUp size={15} /> {user.bannerId ? 'Replace banner' : 'Add banner'}
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
      {value && (
        <div className="grid gap-4">
          <ColourField label="Primary" value={value.primary} onChange={(primary) => onChange({ ...value, primary })} />
          <ColourField label="Accent" value={value.accent} onChange={(accent) => onChange({ ...value, accent })} />
        </div>
      )}
    </section>
  );
}

/**
 * Which server's tag to wear. Only servers that offer one are listed; wearing
 * none is always a choice.
 */
export function TagWearer({
  api,
  user,
  onChanged,
}: {
  api: CommunityClient;
  user: Account;
  onChanged(): Promise<void>;
}) {
  const [servers, setServers] = useState<Community[]>();
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');
  const name = useId();

  useEffect(() => {
    let current = true;
    void api
      .request<{ servers: Community[] }>('/api/servers')
      .then(({ servers: list }) => current && setServers(list.filter((server) => server.tag)))
      .catch(() => current && setServers([]));
    return () => {
      current = false;
    };
  }, [api]);

  const worn = user.tag?.serverId ?? null;
  // The choice shows the moment it is made. Waiting for the service to agree
  // before moving the dot reads as a click that did nothing; if the service
  // refuses, the dot goes back to where it was and says why.
  const [choice, setChoice] = useState<string | null>(worn);
  useEffect(() => setChoice(worn), [worn]);

  const wear = async (serverId: string | null) => {
    setChoice(serverId);
    setBusy(true);
    setProblem('');
    try {
      await api.request('/api/account/tag', 'PATCH', { serverId });
      await onChanged();
    } catch (error) {
      setChoice(worn);
      setProblem(errorMessage(error));
    } finally {
      setBusy(false);
    }
  };
  return (
    <section aria-labelledby="account-tag-heading" className="tag-wearer space-y-3">
      <Heading
        id="account-tag-heading"
        title="Server tag"
        hint="Wear a server's tag beside your name, everywhere you appear."
      />
      {servers === undefined ? (
        <p className="text-xs text-muted-foreground">Looking for tags…</p>
      ) : (
        <div className="space-y-1" role="radiogroup" aria-labelledby="account-tag-heading">
          <label className="flex flex-row items-center gap-2.5 rounded-md px-2 py-1.5 text-xs hover:bg-accent/60">
            <input
              type="radio"
              name={name}
              className="accent-foreground"
              checked={choice === null}
              disabled={busy}
              onChange={() => void wear(null)}
            />
            <span className="text-muted-foreground">None</span>
          </label>
          {servers.map((server) => (
            <label key={server.id} className="flex flex-row items-center gap-2.5 rounded-md px-2 py-1.5 text-xs hover:bg-accent/60">
              <input
                type="radio"
                name={name}
                className="accent-foreground"
                checked={choice === server.id}
                disabled={busy}
                aria-label={`Wear the ${server.tag!.text} tag of ${server.name}`}
                onChange={() => void wear(server.id)}
              />
              <TagChip tag={server.tag!} size="sm" />
              <span className="min-w-0 truncate text-foreground">{server.name}</span>
            </label>
          ))}
          {servers.length === 0 && (
            <p className="px-2 pt-1 text-xs text-muted-foreground">
              None of your servers has a tag yet. Its owner can give it one in the server settings.
            </p>
          )}
        </div>
      )}
      {problem && (
        <p className="rounded-md bg-destructive/10 px-2 py-1 text-xs text-destructive" role="alert">
          {problem}
        </p>
      )}
    </section>
  );
}

/**
 * The tag a server offers its members: a few letters, a badge, a colour.
 * Only the owner and administrators can change it; everybody else sees it.
 */
export function ServerTagEditor({
  api,
  serverId,
  tag,
  canEdit,
  onChanged,
}: {
  api: CommunityClient;
  serverId: string;
  tag?: ServerTag | null;
  canEdit: boolean;
  onChanged(): Promise<void>;
}) {
  const [text, setText] = useState(tag?.text ?? '');
  const [badge, setBadge] = useState<TagBadge>(tag?.badge ?? 'spark');
  const [colour, setColour] = useState(tag?.colour ?? colourPresets[0]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  useEffect(() => {
    setText(tag?.text ?? '');
    setBadge(tag?.badge ?? 'spark');
    setColour(tag?.colour ?? colourPresets[0]);
  }, [tag]);

  const valid = tagTextPattern.test(text);
  const draft: ServerTag = { text: text || 'TAG', badge, colour };
  const save = async (next: ServerTag | null) => {
    setBusy(true);
    setMessage('');
    try {
      await api.request(`/api/servers/${serverId}/tag`, 'PATCH', { tag: next });
      await onChanged();
      setMessage(next ? 'Tag saved.' : 'Tag removed. Nobody is wearing it now.');
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="server-tag-editor rounded-lg border border-border bg-background/40 p-4" aria-labelledby="server-tag-heading">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h3 id="server-tag-heading" className="text-sm font-semibold text-foreground">
            Server tag
          </h3>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            Members can wear it beside their name in every server they are in.
          </p>
        </div>
        <TagChip tag={draft} className={cn(!valid && 'opacity-50')} />
      </div>
      {canEdit ? (
        <div className="space-y-4">
          <div>
            {/* The rule sits outside the label, or it would be read out as
                part of the field's own name every time it takes focus. */}
            <label className="block text-xs font-medium text-foreground">
              Tag
              <input
                className="mt-1.5 block w-28 font-bold uppercase tracking-[0.08em]"
                value={text}
                maxLength={4}
                placeholder="DEN"
                aria-describedby="server-tag-rule"
                onChange={(event) => setText(event.target.value.replace(/[^A-Za-z0-9]/g, ''))}
              />
            </label>
            <small id="server-tag-rule" className="mt-1 block text-[11px] text-muted-foreground">
              One to four letters or digits.
            </small>
          </div>
          <div role="radiogroup" aria-label="Badge" className="space-y-1.5">
            <span className="text-xs font-medium text-foreground">Badge</span>
            <div className="grid grid-cols-6 gap-1.5 sm:grid-cols-12">
              {tagBadges.map((name) => {
                const Icon = badgeIcons[name];
                return (
                  <button
                    key={name}
                    type="button"
                    role="radio"
                    aria-checked={badge === name}
                    aria-label={badgeNames[name]}
                    className={cn(
                      'grid aspect-square place-items-center rounded-md border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                      badge === name ? 'border-foreground bg-accent' : 'border-border hover:bg-accent/60',
                    )}
                    style={badge === name ? { color: colour } : undefined}
                    onClick={() => setBadge(name)}
                  >
                    <Icon className="size-4" aria-hidden="true" />
                  </button>
                );
              })}
            </div>
          </div>
          <ColourField label="Colour" value={colour} onChange={setColour} />
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className={primaryClass}
              disabled={busy || !valid}
              onClick={() => void save({ text, badge, colour })}
            >
              {busy ? 'Saving…' : 'Save tag'}
            </button>
            {tag && (
              <button type="button" className={cn(buttonClass, 'text-muted-foreground')} disabled={busy} onClick={() => void save(null)}>
                Remove tag
              </button>
            )}
            {message && (
              <span className="text-xs text-muted-foreground" role="status">
                {message}
              </span>
            )}
          </div>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          {tag ? 'Only the owner and administrators can change it.' : 'This server has no tag yet.'}
        </p>
      )}
    </section>
  );
}
