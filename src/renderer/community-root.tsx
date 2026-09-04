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
import { LoaderCircle } from 'lucide-react';
import { ServerRail } from './components/server-rail';
import { ApiError, CommunityClient } from './infrastructure/community-client';
import { ImageCache } from './infrastructure/image-cache';
import { ImagesProvider } from './components/avatar';

export interface WorkspaceBindings {
  api: CommunityClient;
  user: Account;
  detail: CommunityDetail;
  servers: Community[];
  onSelectServer(id: string): void;
  onAddServer(): void;
  onManage(): void;
  onCreateChannel(type: 'text' | 'voice'): void;
  onEditChannel(channel: CommunityChannel): void;
  onAccount(): void;
  onProfileChanged(): Promise<void>;
}
export function CommunityRoot({ apiUrl }: { apiUrl: string }) {
  const api = useMemo(() => new CommunityClient(apiUrl.replace(/\/$/, '')), [apiUrl]);
  const images = useMemo(() => new ImageCache(api), [api]);
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
  const [newChannelType, setNewChannelType] = useState<'text' | 'voice'>('voice');
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
  // The list of servers and the room you are in are two different questions, so
  // they are asked separately. Switching rooms then costs one round trip rather
  // than re-reading a list that has not changed.
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
        setServerId((current) =>
          current && result.servers.some((s) => s.id === current) ? current : (result.servers[0]?.id ?? ''),
        );
        setError('');
      } catch (e) {
        if (!abort.signal.aborted) setError(e instanceof Error ? e.message : 'Could not load your servers.');
      } finally {
        if (!abort.signal.aborted) timer = setTimeout(() => void read(), 5000);
      }
    };
    void read();
    return () => {
      abort.abort();
      clearTimeout(timer);
    };
  }, [api, user]);

  useEffect(() => {
    if (!user) return;
    if (!serverId) {
      setDetail(undefined);
      return;
    }
    const abort = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const read = async () => {
      try {
        const next = await api.request<CommunityDetail>(
          `/api/servers/${serverId}`,
          'GET',
          undefined,
          abort.signal,
        );
        if (abort.signal.aborted) return;
        setDetail(next);
        setError('');
      } catch (e) {
        if (abort.signal.aborted) return;
        setError(e instanceof Error ? e.message : 'Could not open that server.');
        // Membership can be taken away while the room is open.
        if (e instanceof ApiError && [403, 404].includes(e.status)) {
          setDetail(undefined);
          setServerId('');
          setDialog(undefined);
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
  const refreshProfile = async () => {
    setUser(await api.request<{ user: Account }>('/api/auth/me').then((result) => result.user));
  };
  const selectServer = (id: string) => {
    if (id !== serverId) {
      // The room you are looking at stays on screen until the next one has
      // loaded. Blanking the window for the round trip reads as a fault.
      setServerId(id);
      setDialog(undefined);
    }
  };
  if (restoring) return <main className="account-loading flex h-full flex-col items-center justify-center gap-4 text-sm text-muted-foreground">Opening Pulse Room…</main>;
  if (!user && error)
    return (
      <main className="account-loading flex h-full flex-col items-center justify-center gap-4 text-sm text-muted-foreground">
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
    <ImagesProvider images={images}>
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
            onCreateChannel: (type) => {
              setEditingChannel(undefined);
              setNewChannelType(type);
              setDialog('channel');
            },
            onEditChannel: (channel) => {
              setEditingChannel(channel);
              setDialog('channel');
            },
            onAccount: () => setDialog('account'),
            onProfileChanged: refreshProfile,
          }}
        />
      ) : (
        <div className="community-empty grid h-full w-full grid-cols-[72px_minmax(0,1fr)] bg-background text-foreground">
          <ServerRail
            servers={servers}
            activeId={serverId}
            onSelect={selectServer}
            onAdd={() => setDialog('add')}
            onAccount={() => setDialog('account')}
            showAccount
          />
          {serverId ? (
            // Opening a room is a moment, not a place: it says so and nothing else.
            <main className="flex min-w-0 flex-col items-center justify-center gap-3 text-sm text-muted-foreground">
              <LoaderCircle className="size-5 animate-spin" aria-hidden="true" />
              Opening your server…
            </main>
          ) : (
            <main className="flex min-w-0 flex-col items-center justify-center gap-3 p-8 text-center">
              <h1 className="text-2xl font-semibold tracking-tight">Welcome, {user.displayName}</h1>
              <p className="max-w-sm text-sm text-muted-foreground">
                Create a private space for your friends, or join one with an invite.
              </p>
              <button
                className="primary-action mt-1 inline-flex h-9 items-center justify-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
                onClick={() => setDialog('add')}
              >
                Create or join a server
              </button>
            </main>
          )}
        </div>
      )}
      {error && (
        <div className="community-status fixed bottom-3 right-3 z-50 max-w-112 rounded-lg border border-destructive bg-card p-3 text-xs text-destructive shadow-lg" role="alert">
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
          type={newChannelType}
          onSaved={refresh}
          onClose={() => setDialog(undefined)}
        />
      )}
      {dialog === 'account' && (
        <AccountDialog
          api={api}
          user={user}
          onClose={() => setDialog(undefined)}
          onProfileChanged={refreshProfile}
          onLogout={async () => {
            await api.request('/api/auth/logout', 'POST');
            clearSession();
          }}
        />
      )}
    </ImagesProvider>
  );
}
