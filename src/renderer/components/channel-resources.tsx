import { ArrowUpRight, ImageIcon, Link2, RefreshCw } from 'lucide-react';
import type { CommunityChannel } from '../../shared/community';
import type { CommunityClient } from '../infrastructure/community-client';
import type { ResourceCollection } from '../infrastructure/use-channel-resources';
import { ChatAttachment } from './chat-attachment';

const date = (value: string) =>
  new Date(value).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });

export function ChannelResources({
  api,
  channel,
  kind,
  collection,
  compact = false,
  onSeeAll,
}: {
  api: CommunityClient;
  channel: CommunityChannel;
  kind: 'media' | 'links';
  collection: ResourceCollection;
  compact?: boolean;
  onSeeAll?(): void;
}) {
  const { media, links, loading, error, next } = collection;
  const visuals = media.filter((file) => /^(image|video)\//.test(file.mime));
  const files = media.filter((file) => !/^(image|video)\//.test(file.mime));
  const empty = kind === 'media' ? !media.length : !links.length;
  const Icon = kind === 'media' ? ImageIcon : Link2;
  const attachment = (file: (typeof media)[number], gallery = false) => (
    <div className={gallery ? 'resource-item resource-visual' : 'resource-item'} key={file.id}>
      <ChatAttachment api={api} channelId={channel.id} file={file} compact={!gallery} gallery={gallery} />
      {!compact && (
        <small
          className="resource-author"
          title={`${file.authorName} · ${new Date(file.createdAt).toLocaleString()}`}
        >
          {file.authorName} · {date(file.createdAt)}
        </small>
      )}
    </div>
  );
  return (
    <section
      className={compact ? 'sidebar-shared' : 'channel-resources'}
      aria-label={compact ? 'Shared in this channel' : `Shared ${kind}`}
    >
      <header className="resources-heading">
        <span title={`Shared in #${channel.name}`}>
          {compact ? 'Shared in this room' : `#${channel.name}`}
        </span>
        {compact ? (
          <button type="button" onClick={onSeeAll}>
            See all
          </button>
        ) : (
          <button type="button" aria-label="Refresh shared content" onClick={collection.refresh}>
            <RefreshCw size={14} aria-hidden="true" />
          </button>
        )}
      </header>
      {!compact && (
        <p className="resources-description">
          {kind === 'media' ? 'Media & files shared in this channel' : 'Links shared in this channel'}
        </p>
      )}
      {loading && empty && (
        <p className="resources-status" role="status">
          Loading shared content…
        </p>
      )}
      {error && (
        <div className="resources-status" role="alert">
          <p>{error}</p>
          <button type="button" onClick={collection.refresh}>
            Try again
          </button>
        </div>
      )}
      {!loading && !error && empty && (
        <div className="resources-empty">
          <Icon size={compact ? 20 : 26} aria-hidden="true" />
          <strong>{kind === 'media' ? 'No media yet' : 'No links yet'}</strong>
          <p>
            {kind === 'media'
              ? 'Files shared in this channel will appear here.'
              : 'Web addresses shared in the chat will appear here.'}
          </p>
        </div>
      )}
      {kind === 'media' ? (
        compact ? (
          <div className="resource-items">{media.slice(0, 4).map((file) => attachment(file))}</div>
        ) : (
          <>
            {!!visuals.length && (
              <section className="resource-section" aria-label="Images and videos">
                <h2>
                  Images & videos{' '}
                  <span>
                    {visuals.length}
                    {next ? '+' : ''}
                  </span>
                </h2>
                <div className="resource-gallery">{visuals.map((file) => attachment(file, true))}</div>
              </section>
            )}
            {!!files.length && (
              <section className="resource-section" aria-label="Files">
                <h2>
                  Files{' '}
                  <span>
                    {files.length}
                    {next ? '+' : ''}
                  </span>
                </h2>
                <div className="resource-items">{files.map((file) => attachment(file))}</div>
              </section>
            )}
          </>
        )
      ) : (
        <div className="resource-items resource-links">
          {links.map((link) => (
            <a
              className="shared-link"
              key={`${link.messageId}:${link.url}`}
              href={link.url}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`Open ${link.url}`}
            >
              <span className="shared-link-icon">
                <Link2 size={18} aria-hidden="true" />
              </span>
              <span>
                <strong title={new URL(link.url).hostname}>
                  {new URL(link.url).hostname.replace(/^www\./, '')}
                </strong>
                <span title={link.url}>{link.url}</span>
                <small title={`${link.authorName} · ${new Date(link.createdAt).toLocaleString()}`}>
                  {link.authorName} · {date(link.createdAt)}
                </small>
              </span>
              <ArrowUpRight size={14} aria-hidden="true" />
            </a>
          ))}
        </div>
      )}
      {!compact && next && (
        <button
          className="resources-more"
          type="button"
          disabled={loading}
          onClick={() => void collection.loadMore()}
        >
          {loading ? 'Loading…' : 'Load older items'}
        </button>
      )}
    </section>
  );
}
