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
import {
  AccountDialog,
  AddServerDialog,
  CategoryDialog,
  ChannelDialog,
  ServerDialog,
} from './components/community-dialogs';
import { Modal } from './components/modal';
import { LoaderCircle } from 'lucide-react';
import { ServerRail } from './components/server-rail';
import { ApiError, CommunityClient } from './infrastructure/community-client';
import { ImageCache } from './infrastructure/image-cache';
import { ImagesProvider } from './components/avatar';
import { DirectPane, DirectSidebar } from './components/directs/direct-messages';
import { useDirects, type DirectsState } from './infrastructure/use-directs';
import { LiveConnection } from './infrastructure/live-connection';
import { LiveProvider, paced, poll } from './infrastructure/live-context';
import { useNotificationCenter } from './infrastructure/use-notification-center';
import { notificationStore } from './infrastructure/notification-store';

/** Direct messages, owned by the root so the list keeps polling anywhere. */
export interface DirectsBindings extends DirectsState {
  open: boolean;
  selectedId?: string;
  setOpen(open: boolean): void;
  select(id?: string): void;
  /** Servers this account is in, so an invitation card knows it was used. */
  joinedServerIds: ReadonlySet<string>;
  /** Opens a server just joined from an invitation. */
  onJoined(serverId: string): void;
}

export interface WorkspaceBindings {
  api: CommunityClient;
  user: Account;
  detail: CommunityDetail;
  servers: Community[];
  /** The server asked for, which is ahead of `detail` while it loads. */
  selectedServerId: string;
  onSelectServer(id: string): void;
  onAddServer(): void;
  onManage(): void;
  onCreateChannel(type: 'text' | 'voice', categoryId?: string): void;
  onEditChannel(channel: CommunityChannel): void;
  onCreateCategory(): void;
  onEditCategory(categoryId: string): void;
  onAccount(): void;
  onProfileChanged(): Promise<void>;
  directs?: DirectsBindings;
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
  const knownServers = useRef(servers);
  knownServers.current = servers;
  // When the open server is gone (deleted, or you were removed from it) the
  // next one is opened in its place. The room stays mounted meanwhile, so a
  // call running in another server is not ended, and there is no empty
  // screen while the list is read again.
  const leaveServer = (goneId: string) => {
    const rest = knownServers.current.filter((server) => server.id !== goneId);
    const next = rest[0]?.id ?? '';
    setServers(rest);
    setServerId((current) => (current === goneId || !current ? next : current));
    if (!next) setDetail(undefined);
    setDialog(undefined);
  };
  const [dialog, setDialog] = useState<'add' | 'server' | 'channel' | 'category' | 'account'>();
  const [editingChannel, setEditingChannel] = useState<CommunityChannel>();
  const [newChannelType, setNewChannelType] = useState<'text' | 'voice'>('voice');
  const [newChannelCategory, setNewChannelCategory] = useState<string>();
  const [editingCategory, setEditingCategory] = useState<string>();
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
      const next = result.servers[0]?.id ?? '';
      setServerId(next);
      if (!next) setDetail(undefined);
    }
  };
  // One socket for the whole signed-in session. It only says what changed;
  // the reads below fetch it, and fall back to their timers without it.
  const userId = user?.id;
  const [live, setLive] = useState<LiveConnection>();
  useEffect(() => {
    if (!userId) return undefined;
    const connection = new LiveConnection(api.url, () => api.token);
    connection.start();
    setLive(connection);
    return () => {
      connection.stop();
      setLive(undefined);
    };
  }, [api, userId]);

  // The list of servers and the room you are in are two different questions, so
  // they are asked separately. Switching rooms then costs one round trip rather
  // than re-reading a list that has not changed.
  useEffect(() => {
    if (!userId) return undefined;
    const poller = poll(async (signal) => {
      try {
        const result = await api.request<{ servers: Community[] }>('/api/servers', 'GET', undefined, signal);
        if (signal.aborted) return;
        setServers(result.servers);
        // Only a first choice is made here. A server that disappears is noticed
        // by the read of that server, and a reply sent before you chose
        // another one must not take you back.
        setServerId((current) => current || (result.servers[0]?.id ?? ''));
        setError('');
      } catch (e) {
        if (!signal.aborted) setError(e instanceof Error ? e.message : 'Could not load your servers.');
      }
    }, paced(live, 5_000));
    const unlisten = live?.listen((event) => {
      // A server's name or picture lives in the list too.
      if (event.type === 'sync' || event.type === 'servers' || event.type === 'server') poller.kick();
    });
    return () => {
      unlisten?.();
      poller.stop();
    };
  }, [api, userId, live]);

  useEffect(() => {
    if (!userId) return undefined;
    if (!serverId) {
      setDetail(undefined);
      return undefined;
    }
    const poller = poll(async (signal) => {
      try {
        const next = await api.request<CommunityDetail>(`/api/servers/${serverId}`, 'GET', undefined, signal);
        if (signal.aborted) return;
        setDetail(next);
        setError('');
      } catch (e) {
        if (signal.aborted) return;
        setError(e instanceof Error ? e.message : 'Could not open that server.');
        // Membership can be taken away while the room is open.
        if (e instanceof ApiError && [403, 404].includes(e.status)) leaveServer(serverId);
      }
    }, paced(live, 5_000));
    const unlisten = live?.listen((event) => {
      if (event.type === 'sync' || (event.type === 'server' && event.serverId === serverId)) poller.kick();
      // Coming and going is common and small: changed in place, not read again.
      if (event.type === 'status')
        setDetail((current) =>
          current?.members.some((member) => member.id === event.userId && member.online !== event.online)
            ? {
                ...current,
                members: current.members.map((member) =>
                  member.id === event.userId ? { ...member, online: event.online } : member,
                ),
              }
            : current,
        );
    });
    return () => {
      unlisten?.();
      poller.stop();
    };
  }, [api, userId, serverId, live]);

  const directState = useDirects(api, Boolean(user), live);
  const [directsOpen, setDirectsOpen] = useState(false);
  const [directId, setDirectId] = useState<string>();
  const joinedServerIds = useMemo(() => new Set(servers.map((server) => server.id)), [servers]);
  const directs: DirectsBindings = {
    ...directState,
    open: directsOpen,
    selectedId: directId,
    setOpen: setDirectsOpen,
    select: (id) => {
      setDirectId(id);
      setDirectsOpen(true);
    },
    joinedServerIds,
    onJoined: (id) =>
      void (async () => {
        // The list is read again first, so the server is there to be opened.
        const result = await api.request<{ servers: Community[] }>('/api/servers').catch(() => undefined);
        if (result) setServers(result.servers);
        setDirectsOpen(false);
        setServerId(id);
        void directState.refresh();
      })(),
  };
  const selectedDirect = directState.conversations.find((conversation) => conversation.id === directId);
  // A profile is also read through the open server, where the tag worn there
  // and the picture beside every message come from, so both are read again.
  const refreshProfile = async () => {
    setUser(await api.request<{ user: Account }>('/api/auth/me').then((result) => result.user));
    if (serverId) await refresh();
  };
  const selectServer = (id: string) => {
    if (id !== serverId) {
      // The room you are looking at stays on screen until the next one has
      // loaded. Blanking the window for the round trip reads as a fault.
      setServerId(id);
      setDialog(undefined);
    }
  };
  useNotificationCenter({
    api,
    userId: user?.id,
    live,
    servers,
    detail,
    openChannel: (id, channelId) => {
      setDirectsOpen(false);
      notificationStore.open(id, channelId);
      selectServer(id);
    },
    openConversation: (id) => {
      setDirectId(id);
      setDirectsOpen(true);
      setDialog(undefined);
    },
  });
  // A conversation in front is what is being read; the room behind it is not.
  useEffect(() => {
    notificationStore.showConversation(directsOpen ? directId : undefined);
    if (directsOpen || !detail) notificationStore.showChannel(undefined);
  }, [directsOpen, directId, detail]);
  if (restoring)
    return (
      <main className="account-loading flex h-full flex-col items-center justify-center gap-4 text-sm text-muted-foreground">
        Opening Pulse Room…
      </main>
    );
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
    <LiveProvider value={live}>
    <ImagesProvider images={images}>
      {detail ? (
        <App
          workspace={{
            api,
            user,
            detail,
            servers,
            selectedServerId: serverId,
            onSelectServer: selectServer,
            onAddServer: () => setDialog('add'),
            onManage: () => setDialog('server'),
            onCreateChannel: (type, categoryId) => {
              setEditingChannel(undefined);
              setNewChannelType(type);
              setNewChannelCategory(categoryId);
              setDialog('channel');
            },
            onCreateCategory: () => {
              setEditingCategory(undefined);
              setDialog('category');
            },
            onEditCategory: (categoryId) => {
              setEditingCategory(categoryId);
              setDialog('category');
            },
            onEditChannel: (channel) => {
              setEditingChannel(channel);
              setDialog('channel');
            },
            onAccount: () => setDialog('account'),
            onProfileChanged: refreshProfile,
            directs,
          }}
        />
      ) : (
        <div className="community-empty grid h-full w-full grid-cols-[72px_minmax(0,1fr)] bg-background text-foreground">
          <ServerRail
            servers={servers}
            activeId={directsOpen ? undefined : serverId}
            onSelect={(id) => {
              setDirectsOpen(false);
              selectServer(id);
            }}
            onAdd={() => setDialog('add')}
            onAccount={() => setDialog('account')}
            showAccount
            directsUnread={directState.unread}
            directsActive={directsOpen}
            onDirects={directState.supported ? () => setDirectsOpen(!directsOpen) : undefined}
          />
          {directsOpen ? (
            <div className="direct-standalone grid min-w-0 grid-cols-[17.5rem_minmax(0,1fr)]">
              <DirectSidebar
                api={api}
                userId={user.id}
                conversations={directState.conversations}
                selectedId={directId}
                onSelect={setDirectId}
                onOpened={(conversation) => {
                  setDirectId(conversation.id);
                  void directState.refresh();
                }}
              />
              <DirectPane
                api={api}
                user={user}
                conversation={selectedDirect}
                joinedServerIds={joinedServerIds}
                onChanged={() => void directState.refresh()}
                onJoined={directs.onJoined}
              />
            </div>
          ) : serverId ? (
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
        <div
          className="community-status fixed bottom-3 right-3 z-50 max-w-112 rounded-lg border border-destructive bg-card p-3 text-xs text-destructive shadow-lg"
          role="alert"
        >
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
            // Like any other switch, the room in view stays until the new
            // server has loaded, so a call is not ended by creating one.
            setServerId(id);
            setDialog(undefined);
            void api
              .request<{ servers: Community[] }>('/api/servers')
              .then((result) => setServers(result.servers))
              .catch(() => undefined);
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
          onRemoved={() => leaveServer(detail.server.id)}
        />
      )}
      {dialog === 'channel' && detail && (
        <ChannelDialog
          api={api}
          detail={detail}
          userId={user.id}
          channel={editingChannel}
          type={newChannelType}
          categoryId={newChannelCategory}
          onSaved={refresh}
          onClose={() => setDialog(undefined)}
        />
      )}
      {dialog === 'category' && detail && (
        <CategoryDialog
          api={api}
          detail={detail}
          userId={user.id}
          categoryId={editingCategory}
          onSaved={refresh}
          onClose={() => setDialog(undefined)}
        />
      )}
      {dialog === 'account' && (
        <AccountDialog
          api={api}
          // The tag worn is one per server; the preview shows the one worn in
          // the server that is open.
          user={{ ...user, tag: detail?.members.find((member) => member.id === user.id)?.tag ?? null }}
          onClose={() => setDialog(undefined)}
          onProfileChanged={refreshProfile}
          onLogout={async () => {
            await api.request('/api/auth/logout', 'POST');
            clearSession();
          }}
        />
      )}
    </ImagesProvider>
    </LiveProvider>
  );
}
