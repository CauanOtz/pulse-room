import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  CalendarDays,
  Camera,
  Check,
  DoorOpen,
  Eye,
  Hash,
  ImageUp,
  LoaderCircle,
  PenLine,
  Trash2,
  Users,
} from 'lucide-react';
import type { Community, CommunityDetail, ServerImageKind } from '../../shared/community';
import type { CommunityClient } from '../infrastructure/community-client';
import { acceptedTypes, maxSourceBytes } from '../infrastructure/prepare-image';
import defaultBanner from '../../../assets/server-banner-default.png';
import { Avatar, useImages } from './avatar';
import { ImageCropDialog } from './image-crop-dialog';
import { Modal } from './modal';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';

interface Artwork {
  id: string | null;
  blob?: Blob;
  url?: string;
}
interface IdentityDraft {
  name: string;
  description: string;
  landingChannelId: string | null;
  welcomeMessage: string;
  icon: Artwork;
  banner: Artwork;
  welcomeBanner: Artwork;
}
const draftOf = (server: Community): IdentityDraft => ({
  name: server.name,
  description: server.description ?? '',
  landingChannelId: server.landingChannelId ?? null,
  welcomeMessage: server.welcomeMessage ?? '',
  icon: { id: server.iconId ?? null },
  banner: { id: server.bannerId ?? null },
  welcomeBanner: { id: server.welcomeBannerId ?? null },
});

/** An authenticated image or the bundled artwork. Local crops remain private until saved. */
export function ServerBanner({
  imageId,
  localUrl,
  className,
  children,
}: {
  imageId?: string | null;
  localUrl?: string;
  className?: string;
  children?: ReactNode;
}) {
  const images = useImages();
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    let active = true;
    setUrl(undefined);
    if (imageId)
      void images
        ?.url(imageId)
        .then((value) => active && setUrl(value))
        .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [images, imageId]);
  return (
    <div className={`server-artwork ${className ?? ''}`} data-default={(!imageId && !localUrl) || undefined}>
      <img
        key={localUrl ?? imageId ?? 'default'}
        src={localUrl ?? url ?? defaultBanner}
        alt=""
        draggable={false}
      />
      {children}
    </div>
  );
}

export function ServerIdentityEditor({
  api,
  detail,
  onChanged,
  onDirtyChange,
  onBusyChange,
}: {
  api: CommunityClient;
  detail: CommunityDetail;
  onChanged(): Promise<void>;
  onDirtyChange(dirty: boolean): void;
  onBusyChange(busy: boolean): void;
  /** Kept for callers; the rail is where these are reached now. */
  onNavigate?(section: 'invites' | 'permissions' | 'members'): void;
  onDelete?(): void;
  canInvite?: boolean;
  canManageRoles?: boolean;
  isOwner?: boolean;
}) {
  const [saved, setSaved] = useState(() => draftOf(detail.server));
  const [draft, setDraft] = useState(saved);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [preview, setPreview] = useState(false);
  const [crop, setCrop] = useState<{ file: File; kind: ServerImageKind }>();
  const input = useRef<HTMLInputElement>(null);
  const target = useRef<ServerImageKind>('icon');
  const localUrls = useRef(new Set<string>());
  const uploads = useRef(new WeakMap<Blob, string>());
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);
  const remoteKey = JSON.stringify(draftOf(detail.server));
  const acceptedRemote = useRef(remoteKey);
  useEffect(() => {
    if (!dirty && !busy && remoteKey !== acceptedRemote.current) {
      const next = draftOf(detail.server);
      setSaved(next);
      setDraft(next);
      acceptedRemote.current = remoteKey;
    }
  }, [remoteKey, dirty, busy]);
  useEffect(() => {
    onDirtyChange(dirty);
  }, [dirty, onDirtyChange]);
  useEffect(() => {
    onBusyChange(busy);
  }, [busy, onBusyChange]);
  useEffect(
    () => () => {
      for (const url of localUrls.current) URL.revokeObjectURL(url);
    },
    [],
  );
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (dirty || busy) {
        event.preventDefault();
        event.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty, busy]);
  const change = <K extends keyof IdentityDraft>(key: K, value: IdentityDraft[K]) => {
    setDraft((current) => ({ ...current, [key]: value }));
    setStatus('');
    setError('');
  };
  const choose = (kind: ServerImageKind) => {
    target.current = kind;
    input.current?.click();
  };
  const remove = (kind: ServerImageKind) => change(kind, { id: null });
  const base = `/api/servers/${detail.server.id}`;
  const channels = detail.channels.filter(
    (channel) =>
      channel.type === 'text' && (!detail.landingChannelIds || detail.landingChannelIds.includes(channel.id)),
  );

  async function save() {
    if (!draft.name.trim()) {
      setError('Give your server a name.');
      return;
    }
    setBusy(true);
    setError('');
    setStatus('');
    try {
      const next = { ...draft, name: draft.name.trim() };
      for (const kind of ['icon', 'banner', 'welcomeBanner'] as const) {
        const artwork = draft[kind];
        let imageId = artwork.id;
        if (artwork.blob) {
          imageId =
            uploads.current.get(artwork.blob) ??
            (await api.upload<{ imageId: string }>(`${base}/appearance-images?kind=${kind}`, artwork.blob))
              .imageId;
          uploads.current.set(artwork.blob, imageId);
        }
        next[kind] = { id: imageId };
      }
      // Only changed fields are patched, so a concurrent editor's other fields survive.
      const patch: Record<string, unknown> = {};
      for (const field of ['name', 'description', 'landingChannelId', 'welcomeMessage'] as const)
        if (next[field] !== saved[field]) patch[field] = next[field];
      for (const kind of ['icon', 'banner', 'welcomeBanner'] as const)
        if (next[kind].id !== saved[kind].id) patch[`${kind}Id`] = next[kind].id;
      if (Object.keys(patch).length) await api.request(base, 'PATCH', patch);
      setSaved(next);
      setDraft(next);
      setStatus('Changes saved.');
      // The write has succeeded even if a subsequent refresh is temporarily offline.
      try {
        await onChanged();
      } catch {
        setStatus('Changes saved. The latest server details will refresh when connected.');
      }
    } catch (problem) {
      uploads.current = new WeakMap();
      setError(problem instanceof Error ? problem.message : 'Could not save these changes.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      className="server-identity-editor"
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      <fieldset disabled={busy} className="server-editor-fields server-studio">
        {/* What members see, edited where they see it. */}
        <section className="studio-hero" aria-labelledby="server-identity-title">
          <h3 id="server-identity-title" className="sr-only">
            Server identity
          </h3>
          <ServerBanner imageId={draft.banner.id} localUrl={draft.banner.url} className="studio-banner">
            <div className="studio-banner-tools">
              <button type="button" className="studio-chip" onClick={() => choose('banner')}>
                <ImageUp size={15} /> Edit banner
              </button>
              {(draft.banner.id || draft.banner.blob) && (
                <button
                  type="button"
                  className="studio-chip is-icon"
                  aria-label="Remove server banner"
                  title="Use default banner"
                  onClick={() => remove('banner')}
                >
                  <Trash2 size={14} />
                </button>
              )}
            </div>
          </ServerBanner>
          <div className="studio-identity">
            <div className="studio-icon server-icon-frame">
              {draft.icon.url ? (
                <img src={draft.icon.url} alt="Server picture preview" />
              ) : (
                <Avatar name={draft.name} imageId={draft.icon.id} className="server-icon-preview" />
              )}
              <button
                type="button"
                className="studio-icon-edit"
                aria-label="Change server picture"
                onClick={() => choose('icon')}
              >
                <Camera size={18} />
              </button>
            </div>
            <div className="studio-title">
              <h2 key={draft.name ? 'named' : 'empty'}>{draft.name || 'Your server'}</h2>
              <p>{draft.description || 'Add a description so people know what this place is for.'}</p>
            </div>
            <div className="studio-hero-actions">
              <button type="button" className="studio-button" onClick={() => choose('icon')}>
                <ImageUp size={15} /> Change picture
              </button>
              {(draft.icon.id || draft.icon.blob) && (
                <button type="button" className="studio-button is-quiet" onClick={() => remove('icon')}>
                  Remove picture
                </button>
              )}
              <button type="button" className="studio-button is-primary" onClick={() => setPreview(true)}>
                <Eye size={15} /> Preview server
              </button>
            </div>
          </div>
          <ServerFacts detail={detail} />
        </section>

        <div className="studio-columns">
          <section className="server-settings-card studio-card" aria-labelledby="studio-details-title">
            <header className="studio-card-head">
              <span className="studio-card-mark" aria-hidden="true">
                <PenLine size={16} />
              </span>
              <span>
                <h3 id="studio-details-title">Details</h3>
                <p>The name and the line under it, wherever the server appears.</p>
              </span>
            </header>
            <div className="server-identity-inputs studio-fields">
              <label className="server-setting-field studio-field">
                Server name
                <span className="counted-input">
                  <input
                    aria-label="Server name"
                    required
                    maxLength={60}
                    value={draft.name}
                    onChange={(event) => change('name', event.target.value)}
                  />
                  <small aria-hidden="true" className={draft.name.length > 50 ? 'is-near' : undefined}>
                    {draft.name.length} / 60
                  </small>
                </span>
              </label>
              <label className="server-setting-field studio-field">
                Description (optional)
                <span className="counted-input">
                  <textarea
                    aria-label="Description (optional)"
                    rows={3}
                    maxLength={200}
                    placeholder="A few words about your server."
                    value={draft.description}
                    onChange={(event) => change('description', event.target.value)}
                  />
                  <small
                    aria-hidden="true"
                    className={draft.description.length > 180 ? 'is-near' : undefined}
                  >
                    {draft.description.length} / 200
                  </small>
                </span>
              </label>
            </div>
          </section>

          <section className="server-settings-card studio-card" aria-labelledby="server-onboarding-title">
            <header className="studio-card-head">
              <span className="studio-card-mark" aria-hidden="true">
                <DoorOpen size={16} />
              </span>
              <span>
                <h3 id="server-onboarding-title">Welcome</h3>
                <p>What somebody sees the first time they arrive.</p>
              </span>
            </header>
            <ServerBanner
              imageId={draft.welcomeBanner.id ?? draft.banner.id}
              localUrl={draft.welcomeBanner.url ?? (!draft.welcomeBanner.id ? draft.banner.url : undefined)}
              className="studio-welcome"
            >
              <div className="welcome-banner-copy">
                <span>Welcome to</span>
                <strong>{draft.name || 'Your server'}</strong>
                <p>{draft.welcomeMessage || draft.description || 'Make a little room for your community.'}</p>
              </div>
              <div className="studio-banner-tools">
                <button type="button" className="studio-chip" onClick={() => choose('welcomeBanner')}>
                  <ImageUp size={15} /> Edit welcome banner
                </button>
                {(draft.welcomeBanner.id || draft.welcomeBanner.blob) && (
                  <button
                    type="button"
                    className="studio-chip is-icon"
                    aria-label="Remove welcome banner"
                    title="Use server banner"
                    onClick={() => remove('welcomeBanner')}
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            </ServerBanner>
            <div className="server-onboarding-row studio-row">
              <div className="server-setting-explanation">
                <label id="landing-channel-label">Default landing channel</label>
                <p>Where new members arrive.</p>
              </div>
              <Select
                value={
                  draft.landingChannelId && channels.some((channel) => channel.id === draft.landingChannelId)
                    ? draft.landingChannelId
                    : 'automatic'
                }
                onValueChange={(value) => change('landingChannelId', value === 'automatic' ? null : value)}
              >
                <SelectTrigger aria-labelledby="landing-channel-label">
                  <Hash size={16} />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="automatic">First available channel</SelectItem>
                  {channels.map((channel) => (
                    <SelectItem key={channel.id} value={channel.id}>
                      {channel.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <label className="server-setting-field studio-field" htmlFor="server-welcome-message">
              Welcome message
              <span className="counted-input">
                <textarea
                  id="server-welcome-message"
                  rows={3}
                  maxLength={300}
                  placeholder="Write a warm welcome for new members…"
                  value={draft.welcomeMessage}
                  onChange={(event) => change('welcomeMessage', event.target.value)}
                />
                <small aria-hidden="true">{draft.welcomeMessage.length} / 300</small>
              </span>
            </label>
          </section>
        </div>
      </fieldset>
      <input
        ref={input}
        type="file"
        accept={acceptedTypes.join(',')}
        className="hidden"
        aria-label="Server artwork file"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = '';
          if (!file) return;
          if (file.size > maxSourceBytes) {
            setError('Choose a picture smaller than 15 MB.');
            return;
          }
          setError('');
          setCrop({ file, kind: target.current });
        }}
      />
      {error && (
        <p className="server-editor-error" role="alert">
          {error}
        </p>
      )}
      {status && (
        <p className="server-save-status" role="status">
          <Check size={14} />
          {status}
        </p>
      )}
      {dirty && (
        <div className="server-unsaved-bar studio-pending" role="region" aria-label="Unsaved server changes">
          <span className="studio-pending-dot" aria-hidden="true" />
          <span>{busy ? 'Saving your changes…' : 'You have unsaved changes.'}</span>
          <button
            type="button"
            className="server-reset-button"
            disabled={busy}
            onClick={() => {
              setDraft(saved);
              setError('');
              setStatus('');
            }}
          >
            Reset
          </button>
          <button type="submit" className="server-save-button" disabled={busy || !draft.name.trim()}>
            {busy && <LoaderCircle className="animate-spin" size={14} />}
            {busy ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      )}
      {crop && (
        <ImageCropDialog
          file={crop.file}
          kind={crop.kind === 'icon' ? 'icon' : 'banner'}
          title={
            crop.kind === 'icon'
              ? 'Server picture'
              : crop.kind === 'banner'
                ? 'Server banner'
                : 'Welcome banner'
          }
          onClose={() => setCrop(undefined)}
          onSave={async (blob) => {
            const url = URL.createObjectURL(blob);
            localUrls.current.add(url);
            change(crop.kind, { id: null, blob, url });
            setCrop(undefined);
          }}
        />
      )}
      {preview && (
        <Modal
          title="Server preview"
          onClose={() => setPreview(false)}
          contentClassName="server-preview-modal"
        >
          <p className="server-preview-caption">
            {dirty
              ? 'Unsaved preview · Only you can see these changes.'
              : 'Preview · How members see your server.'}
          </p>
          <ServerBanner
            imageId={draft.banner.id}
            localUrl={draft.banner.url}
            className="server-preview-banner"
          />
          <div className="server-preview-identity">
            {draft.icon.url ? (
              <img className="server-preview-icon" src={draft.icon.url} alt="Server picture" />
            ) : (
              <Avatar name={draft.name} imageId={draft.icon.id} className="server-preview-icon" />
            )}
            <h3>{draft.name}</h3>
            <p>{draft.description || 'No description yet.'}</p>
          </div>
          <ServerFacts detail={detail} />
          {draft.welcomeMessage && (
            <div className="server-preview-welcome">
              <small>Welcome message</small>
              <p>{draft.welcomeMessage}</p>
            </div>
          )}
        </Modal>
      )}
    </form>
  );
}

export function ServerFacts({ detail }: { detail: CommunityDetail }) {
  const date = detail.server.createdAt
    ? new Date(detail.server.createdAt).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })
    : '—';
  return (
    <dl className="server-facts">
      <div>
        <Users size={20} />
        <span>
          <dt>{detail.members.length}</dt>
          <dd>{detail.members.length === 1 ? 'Member' : 'Members'}</dd>
        </span>
      </div>
      <div>
        <ImageUp size={20} />
        <span>
          <dt>{detail.channelCount ?? detail.channels.length}</dt>
          <dd>Channels</dd>
        </span>
      </div>
      <div>
        <CalendarDays size={20} />
        <span>
          <dt>{date}</dt>
          <dd>Server created</dd>
        </span>
      </div>
    </dl>
  );
}
