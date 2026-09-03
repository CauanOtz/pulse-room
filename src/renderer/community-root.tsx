import { useEffect, useMemo, useRef, useState } from 'react';
import type {
  Account,
  AccountSession,
  Community,
  CommunityChannel,
  CommunityDetail,
} from '../shared/community';
import { App } from './app';
import { AccountScreen } from './components/account-screen';
import { AccountDialog, AddServerDialog, ChannelDialog, ServerDialog } from './components/community-dialogs';
import { Modal } from './components/modal';
import { ServerRail } from './components/server-rail';
import { ApiError, CommunityClient } from './infrastructure/community-client';

export interface WorkspaceBindings {
  api: CommunityClient;
  user: Account;
  detail: CommunityDetail;
  servers: Community[];
  onSelectServer(id: string): void;
  onAddServer(): void;
  onManage(): void;
  onAccount(): void;
}
export function CommunityRoot({ apiUrl }: { apiUrl: string }) {
  const api = useMemo(() => new CommunityClient(apiUrl.replace(/\/$/, '')), [apiUrl]);
  const [user, setUser] = useState<Account>();
  const [restoring, setRestoring] = useState(true);
  const [recovery, setRecovery] = useState('');
  const [error, setError] = useState('');
  const [servers, setServers] = useState<Community[]>([]);
  const [serverId, setServerId] = useState('');
  const [detail, setDetail] = useState<CommunityDetail>();
  const selectedServer = useRef(serverId);
  selectedServer.current = serverId;
  const [dialog, setDialog] = useState<'add' | 'server' | 'channel' | 'account'>();
  const [editingChannel, setEditingChannel] = useState<CommunityChannel>();
  const [retry, setRetry] = useState(0);
  const clearSession = () => {
    api.token = '';
    setUser(undefined);
    setServers([]);
    setDetail(undefined);
    setServerId('');
    setDialog(undefined);
    void window.desktop?.session?.save(null);
  };
  useEffect(() => {
    api.onUnauthorized = clearSession;
    return () => {
      api.onUnauthorized = undefined;
    };
  }, [api]);
  useEffect(() => {
    let active = true;
    setRestoring(true);
    setError('');
    void (async () => {
      try {
        const token = await window.desktop?.session?.read();
        if (!active || !token) return;
        api.token = token;
        const result = await api.request<{ user: Account }>('/api/auth/me');
        if (active) setUser(result.user);
      } catch (e) {
        if (!active) return;
        if (e instanceof ApiError && e.status === 401) clearSession();
        else setError('Could not reach your server. Check your connection and try again.');
      } finally {
        if (active) setRestoring(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [api, retry]);
  async function authenticated(session: AccountSession) {
    api.token = session.token;
    setUser(session.user);
    setRecovery(session.recoveryCode ?? '');
    await window.desktop?.session?.save(session.token).catch(() => {});
  }
  const refresh = async () => {
    const requestedId = serverId;
    const result = await api.request<{ servers: Community[] }>('/api/servers');
    if (requestedId !== selectedServer.current) return;
    setServers(result.servers);
    if (serverId && result.servers.some((s) => s.id === serverId)) {
      const next = await api.request<CommunityDetail>(`/api/servers/${serverId}`);
      if (requestedId === selectedServer.current) setDetail(next);
    } else {
      setDetail(undefined);
      setServerId(result.servers[0]?.id ?? '');
    }
  };
  useEffect(() => {
    if (!user) return;
    const abort = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const read = async () => {
      try {
        const result = await api.request<{ servers: Community[] }>(
          '/api/servers',
          'GET',
          undefined,
          abort.signal,
        );
        if (abort.signal.aborted) return;
        setServers(result.servers);
        if (!serverId || !result.servers.some((s) => s.id === serverId)) {
          setDetail(undefined);
          setServerId(result.servers[0]?.id ?? '');
        } else {
          const next = await api.request<CommunityDetail>(
            `/api/servers/${serverId}`,
            'GET',
            undefined,
            abort.signal,
          );
          if (!abort.signal.aborted) setDetail(next);
        }
        if (!abort.signal.aborted) setError('');
      } catch (e) {
        if (!abort.signal.aborted) {
          setError(e instanceof Error ? e.message : 'Could not load your servers.');
          if (e instanceof ApiError && [403, 404].includes(e.status)) {
            setDetail(undefined);
            setServerId('');
            setDialog(undefined);
          }
        }
      } finally {
        if (!abort.signal.aborted) timer = setTimeout(() => void read(), 5000);
      }
    };
    void read();
    return () => {
      abort.abort();
      clearTimeout(timer);
    };
  }, [api, user, serverId]);
  const selectServer = (id: string) => {
    if (id !== serverId) {
      setDetail(undefined);
      setServerId(id);
      setDialog(undefined);
    }
  };
  if (restoring) return <main className="account-loading">Opening Pulse Room…</main>;
  if (!user && error)
    return (
      <main className="account-loading">
        <p role="alert">{error}</p>
        <button onClick={() => setRetry((x) => x + 1)}>Retry connection</button>
        <button
          onClick={() => {
            clearSession();
            setError('');
          }}
        >
          Use another account
        </button>
      </main>
    );
  if (!user) return <AccountScreen api={api} onAuthenticated={(session) => void authenticated(session)} />;
  return (
    <>
      {detail ? (
        <App
          key={detail.server.id}
          workspace={{
            api,
            user,
            detail,
            servers,
            onSelectServer: selectServer,
            onAddServer: () => setDialog('add'),
            onManage: () => setDialog('server'),
            onAccount: () => setDialog('account'),
          }}
        />
      ) : (
        <div className="community-empty">
          <ServerRail
            servers={servers}
            activeId={serverId}
            onSelect={selectServer}
            onAdd={() => setDialog('add')}
            onAccount={() => setDialog('account')}
          />
          <main>
            <h1>{servers.length ? 'Opening your server…' : `Welcome, ${user.displayName}`}</h1>
            <p>Create a private space for your friends, or join one with an invite.</p>
            <button className="primary-action" onClick={() => setDialog('add')}>
              Create or join a server
            </button>
          </main>
        </div>
      )}
      {error && (
        <div className="community-status" role="alert">
          {error}
        </div>
      )}
      {recovery && (
        <Modal title="Save your recovery code" onClose={() => {}}>
          <p>
            This is the only way to reset a forgotten password. Save it somewhere safe. Do not share it with
            anyone.
          </p>
          <textarea aria-label="Recovery code" readOnly value={recovery} onFocus={(e) => e.target.select()} />
          <button className="primary-action" onClick={() => setRecovery('')}>
            I saved my recovery code
          </button>
        </Modal>
      )}
      {dialog === 'add' && (
        <AddServerDialog
          api={api}
          onClose={() => setDialog(undefined)}
          onCreated={(id) => {
            setDetail(undefined);
            setServerId(id);
            setDialog(undefined);
          }}
        />
      )}
      {dialog === 'server' && detail && (
        <ServerDialog
          api={api}
          user={user}
          detail={detail}
          onClose={() => setDialog(undefined)}
          onChanged={refresh}
          onChannel={(channel) => {
            setEditingChannel(channel);
            setDialog('channel');
          }}
          onRemoved={() => {
            setDetail(undefined);
            setServerId('');
            setDialog(undefined);
            void refresh();
          }}
        />
      )}
      {dialog === 'channel' && detail && (
        <ChannelDialog
          api={api}
          detail={detail}
          channel={editingChannel}
          onSaved={refresh}
          onClose={() => setDialog('server')}
        />
      )}
      {dialog === 'account' && (
        <AccountDialog
          api={api}
          user={user}
          onClose={() => setDialog(undefined)}
          onLogout={async () => {
            await api.request('/api/auth/logout', 'POST');
            clearSession();
          }}
        />
      )}
    </>
  );
}
