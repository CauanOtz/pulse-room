import { useEffect, useRef, useState } from 'react';
import { Download, FileText, Film, Headphones, ImageIcon, LoaderCircle, Play } from 'lucide-react';
import type { ChatAttachment as Attachment } from '../../shared/community';
import { fileSize } from '../../shared/chat';
import type { CommunityClient } from '../infrastructure/community-client';
import { Dialog, DialogCloseButton, DialogContent, DialogTitle } from './ui/dialog';

function downloadBlob(url: string, name: string) {
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
}

/** No credentials in media addresses. Each blob is fetched with channel access. */
export function ChatAttachment({
  api,
  channelId,
  file,
  compact = false,
  gallery = false,
}: {
  api: CommunityClient;
  channelId: string;
  file: Attachment;
  compact?: boolean;
  /** Sidebar visual gallery; the conversation keeps its existing player. */
  gallery?: boolean;
}) {
  const host = useRef<HTMLDivElement>(null);
  const previewTrigger = useRef<HTMLButtonElement>(null);
  const image = file.mime.startsWith('image/');
  const video = file.mime.startsWith('video/');
  const audio = file.mime.startsWith('audio/');
  const [visible, setVisible] = useState(false);
  const [requested, setRequested] = useState(false);
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState<string>();
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const visualPreview = image || (video && gallery);
  const load = visualPreview ? visible || open : requested;
  useEffect(() => {
    if (!host.current || !visualPreview) return;
    if (!('IntersectionObserver' in window)) {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), {
      rootMargin: '200px',
    });
    observer.observe(host.current);
    return () => observer.disconnect();
  }, [visualPreview]);
  useEffect(() => {
    if (!load) return;
    const abort = new AbortController();
    let objectUrl: string | undefined;
    setError('');
    void api
      .blob(`/api/channels/${channelId}/attachments/${file.id}`, abort.signal)
      .then((blob) => {
        if (abort.signal.aborted) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      })
      .catch((error) => {
        if (!abort.signal.aborted) setError(error instanceof Error ? error.message : 'File unavailable.');
      });
    return () => {
      abort.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      setUrl(undefined);
    };
  }, [api, channelId, file.id, load, retry]);
  const Icon = image ? ImageIcon : video ? Film : audio ? Headphones : FileText;
  const download = async () => {
    if (url) {
      downloadBlob(url, file.name);
      return;
    }
    setError('');
    try {
      const objectUrl = URL.createObjectURL(
        await api.blob(`/api/channels/${channelId}/attachments/${file.id}`),
      );
      downloadBlob(objectUrl, file.name);
      setTimeout(() => URL.revokeObjectURL(objectUrl), 30_000);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Download failed.');
    }
  };
  return (
    <div
      ref={host}
      className={`chat-attachment ${compact ? 'is-compact' : ''} ${gallery ? 'is-gallery' : ''}`}
    >
      {image ? (
        <button
          type="button"
          className="attachment-image"
          ref={previewTrigger}
          aria-label={`Open ${file.name}`}
          onClick={() => setOpen(true)}
        >
          {url ? (
            <img src={url} alt={file.name} loading="lazy" />
          ) : (
            <ImageIcon size={22} aria-hidden="true" />
          )}
        </button>
      ) : video && gallery ? (
        <button
          type="button"
          className="attachment-image attachment-video-preview"
          ref={previewTrigger}
          aria-label={`Open ${file.name}`}
          onClick={() => setOpen(true)}
        >
          {url ? (
            <video src={url} muted playsInline preload="metadata" aria-hidden="true" />
          ) : (
            <Film size={22} aria-hidden="true" />
          )}
          <span className="attachment-video-play">
            <Play size={16} aria-hidden="true" />
          </span>
        </button>
      ) : (video || audio) && requested ? (
        <div className="attachment-player">
          {url ? (
            video ? (
              <video
                src={url}
                controls
                preload="metadata"
                aria-label={file.name}
                onError={() => setError('This video could not be played. You can still download it.')}
              />
            ) : (
              <audio
                src={url}
                controls
                preload="metadata"
                aria-label={file.name}
                onError={() => setError('This audio could not be played. You can still download it.')}
              />
            )
          ) : (
            !error && <LoaderCircle className="animate-spin" size={20} aria-label="Loading media" />
          )}
        </div>
      ) : (
        <button
          type="button"
          className="attachment-file-icon"
          aria-label={video || audio ? `Play ${file.name}` : `Download ${file.name}`}
          onClick={() => (video || audio ? setRequested(true) : void download())}
        >
          <Icon size={22} aria-hidden="true" />
          {(video || audio) && <Play size={11} className="attachment-play" aria-hidden="true" />}
        </button>
      )}
      <div className="attachment-caption">
        <span>
          <strong title={file.name}>{file.name}</strong>
          <small>
            {fileSize(file.size)} · {file.mime.split('/')[1].toUpperCase()}
          </small>
        </span>
        <button
          type="button"
          className="attachment-download"
          aria-label={`Download ${file.name}`}
          onClick={() => void download()}
        >
          <Download size={15} aria-hidden="true" />
        </button>
      </div>
      {error && (
        <p role="alert" className="attachment-error">
          {error}
          <button
            type="button"
            onClick={() => (image || video || audio ? setRetry((value) => value + 1) : void download())}
          >
            Retry
          </button>
        </p>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          className={`media-preview-dialog ${gallery ? 'sidebar-media-dialog' : ''}`}
          aria-describedby={undefined}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            previewTrigger.current?.focus();
          }}
        >
          <header>
            <DialogTitle>{file.name}</DialogTitle>
            <DialogCloseButton label="Close media preview" />
          </header>
          {url ? (
            video && gallery ? (
              <video src={url} controls autoPlay aria-label={file.name} />
            ) : (
              <img src={url} alt={file.name} />
            )
          ) : (
            <p>{error || 'Loading media…'}</p>
          )}
          <footer>
            <span>{fileSize(file.size)}</span>
            <button type="button" onClick={() => void download()}>
              <Download size={14} /> Download
            </button>
          </footer>
        </DialogContent>
      </Dialog>
    </div>
  );
}
