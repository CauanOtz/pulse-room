import { useState } from 'react';
import type { CommunityDetail } from '../../shared/community';
import type { CommunityClient } from '../infrastructure/community-client';
import { Modal } from './modal';
import { ServerBanner } from './server-identity-editor';

/** One acknowledgement per membership, independent of chat history and server polling. */
export function ServerWelcome({
  api,
  detail,
  onChanged,
}: {
  api: CommunityClient;
  detail: CommunityDetail;
  onChanged(): Promise<void>;
}) {
  const [dismissed, setDismissed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  if (!detail.welcomePending || dismissed) return null;
  const { server } = detail;
  const acknowledge = async () => {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await api.request(`/api/servers/${server.id}/welcome/ack`, 'POST');
      setDismissed(true);
      await onChanged().catch(() => undefined);
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : 'Please try again.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      title={`Welcome to ${server.name}`}
      contentClassName="server-welcome-modal"
      onClose={() => void acknowledge()}
    >
      <ServerBanner imageId={server.welcomeBannerId ?? server.bannerId} className="welcome-banner">
        <div className="welcome-banner-copy">
          <span>Welcome to</span>
          <strong>{server.name}</strong>
          {server.description && <p>{server.description}</p>}
        </div>
      </ServerBanner>
      <div className="server-welcome-body">
        {server.welcomeMessage && <p>{server.welcomeMessage}</p>}
        {error && (
          <p className="server-editor-error" role="alert">
            {error}
          </p>
        )}
        <button
          type="button"
          className="server-save-button"
          disabled={busy}
          onClick={() => void acknowledge()}
        >
          {busy ? 'Opening server…' : 'Enter server'}
        </button>
      </div>
    </Modal>
  );
}
