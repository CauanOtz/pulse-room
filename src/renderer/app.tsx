import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { Hash, Maximize2, Users, Volume2 } from 'lucide-react';
import type { UpdateStatus } from '../shared/desktop-api';
import { ConferenceController } from './application/conference-controller';
import { emptyPresence, presenceSounds, type RoomPresence } from './application/room-presence';
import { voiceChannels, type Participant } from './domain/conference';
import { accountOf, type ChannelOccupancy, type RosterEntry } from './domain/roster';
import { RoomSoundPlayer } from './infrastructure/media/room-sound-player';
import { CallControls } from './components/call-controls';
import { ChannelSidebar } from './components/channel-sidebar';
import { ProfileBar } from './components/profile-bar';
import { ParticipantPopover } from './components/participant-popover';
import { RoomAudio } from './components/room-audio';
import { MediaOutput } from './components/media-output';
import { ServerRail } from './components/server-rail';
import { SettingsDialog } from './components/settings-dialog';
import { SourcePicker } from './components/source-picker';
import { Stage } from './components/stage';
import { Tooltip } from './components/ui/tooltip';
import { cn } from './components/ui/utils';
import { ConferenceGatewayFactory } from './infrastructure/conference/conference-gateway-factory';
import {
  MediaDevicesService,
  type AvailableMediaDevices,
} from './infrastructure/media/media-devices-service';
import { LocalSettingsRepository } from './infrastructure/persistence/local-settings-repository';
import type { WorkspaceBindings } from './community-root';
import { canManage, type CommunityChannel } from '../shared/community';
import { TextChat } from './components/text-chat';
import { MemberSidebar } from './components/member-sidebar';

const mediaDevicesService = new MediaDevicesService();
const roomSoundPlayer = new RoomSoundPlayer();

/**
 * The call is a session of its own. It must not become a property of whichever
 * server happens to be open in the sidebar, or browsing another chat would
 * make its channel and permissions appear to have disappeared.
 */
interface ActiveCall {
  serverId: string;
  serverName: string;
  channelId: string;
  channelName: string;
  canSpeak: boolean;
  canShare: boolean;
  avatars: ReadonlyMap<string, string | null | undefined>;
}

export function App({ workspace }: { workspace?: WorkspaceBindings }) {
  // One picture per account, looked up by everything that draws a person.
  const avatars = useMemo(
    () => new Map((workspace?.detail.members ?? []).map((member) => [member.id, member.avatarId])),
    [workspace?.detail.members],
  );
  const controller = useMemo(() => {
    const repository = new LocalSettingsRepository(window.localStorage, workspace?.user.id);
    if (workspace) {
      const saved = repository.load();
      repository.save({
        ...saved,
        displayName: workspace.user.displayName,
        roomId:
          workspace.detail.channels.find((c) => c.type === 'voice' && c.id === saved.roomId)?.id ??
          workspace.detail.channels.find((c) => c.type === 'voice')?.id ??
          '',
      });
    }
    return new ConferenceController(
      ConferenceGatewayFactory.create(
        workspace
          ? {
              apiUrl: workspace.api.url,
              accessCode: workspace.api.token,
            }
          : undefined,
      ),
      repository,
    );
  }, [workspace?.api, workspace?.user.id]);
  useEffect(
    () => () => {
      void controller.gateway.leave();
    },
    [controller],
  );
  const channels = workspace ? workspace.detail.channels.filter((c) => c.type === 'voice') : voiceChannels;
  const [viewId, setViewId] = useState(workspace?.detail.channels.find((c) => c.type === 'text')?.id ?? '');
  const textChannel = workspace?.detail.channels.find((c) => c.type === 'text' && c.id === viewId);
  const snapshot = useSyncExternalStore(
    controller.gateway.subscribe.bind(controller.gateway),
    controller.gateway.getSnapshot.bind(controller.gateway),
  );
  const [settings, setSettings] = useState(controller.getSettings());
  const [settingsOpen, setSettingsOpen] = useState(false);
  // The list of people beside a channel is the first thing to go on a narrow
  // window, so it is something the reader can put away.
  const [membersOpen, setMembersOpen] = useState(true);
  // Held still, so the panel that polls it is not restarted on every render.
  const readHealth = useCallback(() => controller.gateway.readHealth(), [controller]);
  const [sourcePickerOpen, setSourcePickerOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [version, setVersion] = useState(__APP_VERSION__);
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus>({ state: 'idle' });
  const [devices, setDevices] = useState<AvailableMediaDevices>({ microphones: [], speakers: [] });
  const [occupancy, setOccupancy] = useState<ChannelOccupancy[]>([]);
  // The sound of a shared screen is the room's, not the picture's, so its level
  // is held here where both the player and the stage can reach it.
  const [screenVolumes, setScreenVolumes] = useState<Record<string, number>>({});
  // The room server normally reports active speakers. Audio playback also
  // measures the stream locally so the ring still works when a self-hosted
  // deployment delays or omits those reports.
  const [heardSpeaking, setHeardSpeaking] = useState<ReadonlySet<string>>(() => new Set());
  const [openParticipant, setOpenParticipant] = useState<{
    id: string;
    position: { x: number; y: number };
  }>();

  const [activeCall, setActiveCall] = useState<ActiveCall>();
  const activeCallRef = useRef(activeCall);
  activeCallRef.current = activeCall;
  const returningToCall = useRef(false);

  const joined = snapshot.connectionState !== 'disconnected';
  const activeChannelName =
    activeCall?.channelName ?? channels.find((channel) => channel.id === settings.roomId)?.name;
  const manager = canManage(workspace?.detail.server.role);
  const canSpeak = activeCall?.canSpeak ?? true;
  const canShare = activeCall?.canShare ?? true;

  const visibleParticipants = useMemo(
    () =>
      snapshot.participants.map((participant) =>
        heardSpeaking.has(participant.id) && !participant.isSpeaking
          ? { ...participant, isSpeaking: true }
          : participant,
      ),
    [heardSpeaking, snapshot.participants],
  );

  const handleRemoteSpeaking = useCallback((participantId: string, speaking: boolean) => {
    setHeardSpeaking((current) => {
      if (current.has(participantId) === speaking) return current;
      const next = new Set(current);
      if (speaking) next.add(participantId);
      else next.delete(participantId);
      return next;
    });
  }, []);

  useEffect(() => {
    const connected = new Set(snapshot.participants.map((participant) => participant.id));
    setHeardSpeaking((current) => {
      if ([...current].every((id) => connected.has(id))) return current;
      return new Set([...current].filter((id) => connected.has(id)));
    });
  }, [snapshot.participants]);

  // Opening a different server starts on its text channel. The one exception
  // is the explicit "return to call" action, which restores the voice stage.
  useEffect(() => {
    if (!workspace) return;
    const call = activeCallRef.current;
    if (returningToCall.current && call?.serverId === workspace.detail.server.id) {
      returningToCall.current = false;
      setViewId(call.channelId);
      return;
    }
    setViewId(workspace.detail.channels.find((channel) => channel.type === 'text')?.id ?? '');
  }, [workspace?.detail.server.id]);

  // Refresh names, permissions and pictures while the call's own server is in
  // view. When another server is open, this snapshot keeps the live session
  // independent from the navigation state.
  useEffect(() => {
    if (!workspace || !activeCall || workspace.detail.server.id !== activeCall.serverId) return;
    const channel = workspace.detail.channels.find(
      (candidate): candidate is CommunityChannel =>
        candidate.type === 'voice' && candidate.id === activeCall.channelId,
    );
    if (!channel) return;
    const nextAvatars = new Map(workspace.detail.members.map((member) => [member.id, member.avatarId]));
    setActiveCall((current) =>
      current
        ? {
            ...current,
            serverName: workspace.detail.server.name,
            channelName: channel.name,
            canSpeak: manager || channel.allowSpeak,
            canShare: manager || channel.allowShare,
            avatars: nextAvatars,
          }
        : current,
    );
  }, [activeCall?.channelId, activeCall?.serverId, manager, workspace]);

  useEffect(() => {
    if (!joined || !activeCall) return;
    if (!canSpeak && snapshot.microphoneEnabled) void controller.toggleMicrophone();
    if (!canShare && snapshot.screenSharing) void controller.gateway.stopScreenShare();
  }, [
    activeCall,
    canSpeak,
    canShare,
    joined,
    snapshot.microphoneEnabled,
    snapshot.screenSharing,
    controller,
  ]);
  // Who is in a call anywhere in this server: the room this client joined knows
  // its own people first hand, the rest come from the service.
  const inVoice = useMemo(
    () =>
      new Set([
        ...occupancy.flatMap((room) => room.occupants.map((one) => accountOf(one.identity))),
        ...(activeCall?.serverId === workspace?.detail.server.id
          ? snapshot.participants.map((participant) => accountOf(participant.id))
          : []),
      ]),
    [activeCall?.serverId, occupancy, snapshot.participants, workspace?.detail.server.id],
  );

  const broadcasters = useMemo(
    () => snapshot.participants.filter((participant) => participant.screenStream),
    [snapshot.participants],
  );

  const presence = useRef<RoomPresence>(emptyPresence);
  useEffect(() => {
    const next: RoomPresence = {
      connected: snapshot.connectionState === 'connected',
      remoteIds: snapshot.participants
        .filter((participant) => !participant.isLocal)
        .map((participant) => participant.id),
      microphoneOn: snapshot.microphoneEnabled,
      broadcastIds: broadcasters.map((participant) => participant.id),
    };
    const sounds = presenceSounds(presence.current, next);
    presence.current = next;
    if (settings.roomSounds) sounds.forEach((sound) => roomSoundPlayer.play(sound));
  }, [
    broadcasters,
    settings.roomSounds,
    snapshot.connectionState,
    snapshot.microphoneEnabled,
    snapshot.participants,
  ]);

  // Rooms this client did not join can only be seen through the service.
  useEffect(() => {
    if (!workspace) return undefined;
    let active = true;
    const read = () =>
      void workspace.api
        .request<{ rooms: ChannelOccupancy[] }>(`/api/presence?serverId=${workspace.detail.server.id}`)
        .then(({ rooms }) => active && setOccupancy(rooms))
        .catch(() => active && setOccupancy([]));
    read();
    const timer = setInterval(read, 3_000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [snapshot.connectionState, workspace?.api, workspace?.detail.server.id]);

  useEffect(() => {
    void mediaDevicesService.list().then(setDevices);
    if (!window.desktop) return;
    void window.desktop.app.getVersion().then(setVersion);
    return window.desktop.updates.onStatus(setUpdateStatus);
  }, []);

  const run = useCallback(async (action: () => Promise<void>) => {
    setBusy(true);
    try {
      await action();
    } catch {
      // The gateway exposes a user-safe error in its snapshot.
    } finally {
      setBusy(false);
    }
  }, []);

  const popoverEntry: RosterEntry | undefined = useMemo(() => {
    const participant = visibleParticipants.find((each) => each.id === openParticipant?.id);
    if (!participant) return undefined;
    return {
      id: participant.id,
      name: participant.name,
      initials: participant.initials,
      accent: participant.accent,
      isLocal: participant.isLocal,
      isBroadcasting: participant.isBroadcasting,
      isMuted: participant.isMuted,
      isSpeaking: participant.isSpeaking,
      volume: participant.volume,
      locallyMuted: participant.locallyMuted,
      detailed: true,
    };
  }, [openParticipant?.id, visibleParticipants]);

  const handleChannelSelect = (channelId: string) => {
    setViewId(channelId);
    if (channelId === settings.roomId && joined) return;
    const channel = workspace?.detail.channels.find(
      (candidate): candidate is CommunityChannel => candidate.type === 'voice' && candidate.id === channelId,
    );
    if (workspace && channel) {
      setActiveCall({
        serverId: workspace.detail.server.id,
        serverName: workspace.detail.server.name,
        channelId,
        channelName: channel.name,
        canSpeak: manager || channel.allowSpeak,
        canShare: manager || channel.allowShare,
        avatars,
      });
    }
    setSettings((current) => ({ ...current, roomId: channelId }));
    void run(() => controller.enterRoom(channelId));
  };

  const handleLeave = () =>
    void run(async () => {
      await controller.gateway.leave();
      setActiveCall(undefined);
    });

  const handleReturnToCall = () => {
    if (!activeCall) return;
    if (workspace && workspace.detail.server.id !== activeCall.serverId) {
      returningToCall.current = true;
      workspace.onSelectServer(activeCall.serverId);
      return;
    }
    setViewId(activeCall.channelId);
  };

  const handleShareRequest = () => {
    if (!canShare) return;
    if (snapshot.screenSharing) {
      void run(() => controller.toggleScreenShare());
    } else {
      setSourcePickerOpen(true);
    }
  };

  const handleSourceSelected = (sourceId?: string) => {
    setSourcePickerOpen(false);
    void run(() => controller.toggleScreenShare(sourceId));
  };

  const handleSettingsSaved = (nextSettings: typeof settings) => {
    if (workspace) nextSettings = { ...nextSettings, displayName: workspace.user.displayName };
    setSettings(nextSettings);
    setSettingsOpen(false);
    void run(() => controller.saveSettings(nextSettings));
  };

  return (
    <div className="app-shell grid h-full w-full grid-cols-[60px_246px_minmax(0,1fr)] grid-rows-[minmax(0,1fr)_auto] bg-background text-foreground">
      <VideoLevelFilter />
      <ServerRail
        servers={workspace?.servers}
        activeId={workspace?.detail.server.id}
        onSelect={workspace?.onSelectServer}
        onAdd={workspace?.onAddServer}
        onAccount={workspace?.onAccount}
      />
      <ChannelSidebar
        connectionState={snapshot.connectionState}
        channels={channels}
        serverName={workspace?.detail.server.name}
        textChannels={workspace?.detail.channels.filter((c) => c.type === 'text')}
        selectedTextId={textChannel?.id}
        onSelectText={setViewId}
        onManage={workspace?.onManage}
        activeChannelId={settings.roomId}
        connectedChannelName={activeCall?.channelName}
        connectedServerName={activeCall?.serverName}
        participants={visibleParticipants}
        avatars={avatars}
        joined={joined}
        busy={busy}
        screenSharing={snapshot.screenSharing}
        occupancy={occupancy}
        onLeave={handleLeave}
        onReturnToCall={handleReturnToCall}
        onShare={handleShareRequest}
        onSelectChannel={handleChannelSelect}
        onOpenParticipant={(entry, position) => setOpenParticipant({ id: entry.id, position })}
        watching={snapshot.watching}
        onWatch={(participantId, watching) => controller.gateway.watchScreen(participantId, watching)}
        onPreview={(participantId) => controller.gateway.previewScreen(participantId)}
        onCreateChannel={manager ? workspace?.onCreateChannel : undefined}
        onEditChannel={
          manager && workspace
            ? (channelId) => {
                const channel = workspace.detail.channels.find((each) => each.id === channelId);
                if (channel) workspace.onEditChannel(channel);
              }
            : undefined
        }
      />

      <ProfileBar
        displayName={settings.displayName}
        avatarId={workspace?.user.avatarId}
        joined={joined}
        busy={busy}
        microphoneEnabled={snapshot.microphoneEnabled}
        deafened={snapshot.deafened}
        devices={devices}
        microphoneDeviceId={settings.microphoneDeviceId}
        speakerDeviceId={settings.speakerDeviceId}
        onToggleMicrophone={() => canSpeak && void run(() => controller.toggleMicrophone())}
        onToggleDeafen={() => void run(() => controller.toggleDeafen())}
        onSelectMicrophone={(deviceId) => handleSettingsSaved({ ...settings, microphoneDeviceId: deviceId })}
        onSelectSpeaker={(deviceId) => handleSettingsSaved({ ...settings, speakerDeviceId: deviceId })}
        user={workspace?.user}
        onChoosePicture={
          workspace &&
          (async (image) => {
            await workspace.api.upload('/api/account/avatar', image);
            await workspace.onProfileChanged();
          })
        }
        onRemovePicture={
          workspace &&
          (async () => {
            await workspace.api.request('/api/account/avatar', 'DELETE');
            await workspace.onProfileChanged();
          })
        }
        onOpenAccount={workspace?.onAccount}
        onOpenSettings={() => setSettingsOpen(true)}
      />

      <main className="room-main col-start-3 row-span-2 row-start-1 flex min-w-0 flex-col bg-background">
        <header className="room-header flex h-13 flex-none items-center gap-2.5 border-b border-border bg-card/35 px-5 text-sm">
          <div className="room-title flex min-w-0 flex-1 items-center gap-2">
            {textChannel ? (
              <Hash aria-hidden="true" className="size-4 shrink-0 text-primary" />
            ) : (
              <Volume2 aria-hidden="true" className="size-4 shrink-0 text-primary" />
            )}
            <strong className="shrink-0 font-semibold">
              {textChannel?.name ?? activeChannelName ?? 'Choose a channel'}
            </strong>
            <span className="room-description min-w-0 truncate border-l border-border pl-2.5 text-xs text-muted-foreground">
              {workspace ? workspace.detail.server.name : 'A room for games, films, and unfinished stories.'}
            </span>
          </div>
          {textChannel && (
            <Tooltip label={membersOpen ? 'Hide members' : 'Show members'}>
              <button
                className={cn(
                  'grid size-8 shrink-0 place-items-center rounded-md transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  membersOpen ? 'text-foreground' : 'text-muted-foreground',
                )}
                type="button"
                aria-pressed={membersOpen}
                aria-label={membersOpen ? 'Hide members' : 'Show members'}
                onClick={() => setMembersOpen((open) => !open)}
              >
                <Users aria-hidden="true" className="size-4" />
              </button>
            </Tooltip>
          )}
        </header>

        <div className="room-content relative grid min-h-0 flex-1 grid-cols-1 grid-rows-1 place-items-stretch overflow-hidden">
          {textChannel && workspace ? (
            // Reading a channel leaves room beside it for the people in it.
            <div className="flex min-h-0 min-w-0">
              <TextChat
                key={textChannel.id}
                api={workspace.api}
                user={workspace.user}
                channel={textChannel}
                manager={manager}
                avatars={avatars}
              />
              {membersOpen && (
                <MemberSidebar
                  members={workspace.detail.members}
                  userId={workspace.user.id}
                  voiceIds={inVoice}
                />
              )}
            </div>
          ) : (
            // The room is a card of its own, inset from the window.
            <div className="flex min-h-0 min-w-0 p-2.5">
              <Stage
                avatars={activeCall?.avatars ?? avatars}
                participants={visibleParticipants}
                joined={joined}
                speakerDeviceId={settings.speakerDeviceId}
                expandLevels={settings.expandScreenLevels}
                watching={snapshot.watching}
                onWatch={(participantId, watching) => controller.gateway.watchScreen(participantId, watching)}
                onOptions={(participant, position) => setOpenParticipant({ id: participant.id, position })}
                screenVolumes={screenVolumes}
                onScreenVolume={(participantId, volume) =>
                  setScreenVolumes((volumes) => ({ ...volumes, [participantId]: volume }))
                }
              >
                {joined && (
                  <CallControls
                    microphoneEnabled={snapshot.microphoneEnabled}
                    deafened={snapshot.deafened}
                    screenSharing={snapshot.screenSharing}
                    quality={settings.screenSharePreset}
                    busy={busy}
                    onToggleMicrophone={() => canSpeak && void run(() => controller.toggleMicrophone())}
                    onToggleDeafen={() => void run(() => controller.toggleDeafen())}
                    onShare={handleShareRequest}
                    onSelectQuality={(preset) => {
                      setSettings((current) => ({ ...current, screenSharePreset: preset }));
                      void run(() => controller.setScreenQuality(preset));
                    }}
                    onOpenSettings={() => setSettingsOpen(true)}
                    onLeave={handleLeave}
                  />
                )}
              </Stage>
            </div>
          )}
          {joined && !canSpeak && (
            <p className="permission-note mx-4 mb-2 rounded-lg border border-border bg-card px-3 py-2 text-xs text-muted-foreground">
              You can listen in this channel. Speaking is restricted by its permissions.
            </p>
          )}
          {joined && !canShare && (
            <p className="permission-note mx-4 mb-2 rounded-lg border border-border bg-card px-3 py-2 text-xs text-muted-foreground">
              Screen sharing is restricted in this channel.
            </p>
          )}
          {snapshot.error && (
            <div
              className="error-banner mx-4 mb-2 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive"
              role="alert"
            >
              {snapshot.error}
            </div>
          )}
          {joined && textChannel && (
            <CallMiniPlayer
              participant={visibleParticipants.find(
                (participant) => participant.isBroadcasting && snapshot.watching.includes(participant.id),
              )}
              speakerDeviceId={settings.speakerDeviceId}
              expandLevels={settings.expandScreenLevels}
              withMembers={membersOpen}
              onReturn={handleReturnToCall}
            />
          )}
        </div>
      </main>

      <RoomAudio
        participants={snapshot.participants}
        speakerDeviceId={settings.speakerDeviceId}
        watching={snapshot.watching}
        screenVolumes={screenVolumes}
        onSpeakingChange={handleRemoteSpeaking}
      />

      {popoverEntry && openParticipant && (
        <ParticipantPopover
          entry={popoverEntry}
          position={openParticipant.position}
          onVolumeChange={(volume) => controller.gateway.setParticipantVolume(popoverEntry.id, volume)}
          onMutedChange={(muted) => controller.gateway.setParticipantMuted(popoverEntry.id, muted)}
          watching={snapshot.watching.includes(popoverEntry.id)}
          onStopWatching={() => controller.gateway.watchScreen(popoverEntry.id, false)}
          onClose={() => setOpenParticipant(undefined)}
        />
      )}

      <SourcePicker
        open={sourcePickerOpen}
        onClose={() => setSourcePickerOpen(false)}
        onSelect={handleSourceSelected}
      />
      <SettingsDialog
        managedAccount={Boolean(workspace)}
        open={settingsOpen}
        initialSettings={settings}
        devices={devices}
        version={version}
        updateStatus={updateStatus}
        microphoneLive={joined && snapshot.microphoneEnabled}
        microphoneProblem={snapshot.error}
        readHealth={joined ? readHealth : undefined}
        onClose={() => setSettingsOpen(false)}
        onSave={handleSettingsSaved}
        onCheckUpdates={() => window.desktop && void window.desktop.updates.check().then(setUpdateStatus)}
        onInstallUpdate={() => window.desktop && void window.desktop.updates.install()}
      />
    </div>
  );
}

/**
 * A screen somebody is already watching follows them into text channels. It
 * reuses the same MediaStream and stays muted because RoomAudio owns playback.
 */
function CallMiniPlayer({
  participant,
  speakerDeviceId,
  expandLevels,
  withMembers,
  onReturn,
}: {
  participant?: Participant;
  speakerDeviceId?: string;
  expandLevels: boolean;
  withMembers: boolean;
  onReturn(): void;
}) {
  const stream = participant?.screenStream;
  if (!participant || !stream?.getVideoTracks().length) return null;

  return (
    <aside
      className={cn(
        'call-mini-player absolute bottom-4 right-4 z-10 aspect-video w-[min(20rem,36vw)] overflow-hidden rounded-lg border border-border bg-stage shadow-2xl shadow-black/50',
        withMembers && 'with-members',
      )}
      aria-label="Call picture in picture"
    >
      <button
        className="group relative size-full overflow-hidden text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
        type="button"
        aria-label="Open the call"
        onClick={onReturn}
      >
        <MediaOutput
          stream={stream}
          muted
          speakerDeviceId={speakerDeviceId}
          video
          className={expandLevels ? 'screen-video is-expanded' : 'screen-video'}
        />
        <span className="absolute inset-x-0 bottom-0 flex items-center gap-2 bg-gradient-to-t from-black/85 to-transparent px-3 pb-2.5 pt-8 text-xs font-medium text-white">
          <span className="size-1.5 rounded-full bg-destructive" />
          <span className="min-w-0 flex-1 truncate">Live from {participant.name}</span>
          <Maximize2 className="size-3.5 opacity-70 transition-opacity group-hover:opacity-100" />
        </span>
      </button>
    </aside>
  );
}

/**
 * Screen capture is encoded as limited-range video. When a decoder renders it
 * as full range, black turns into grey. This filter maps the limited range back
 * onto the full one for viewers who need it.
 */
function VideoLevelFilter() {
  return (
    <svg className="filter-defs pointer-events-none absolute size-0" aria-hidden="true" focusable="false">
      <filter id="expanded-video-levels" colorInterpolationFilters="sRGB">
        <feComponentTransfer>
          <feFuncR type="linear" slope="1.164" intercept="-0.073" />
          <feFuncG type="linear" slope="1.164" intercept="-0.073" />
          <feFuncB type="linear" slope="1.164" intercept="-0.073" />
        </feComponentTransfer>
      </filter>
    </svg>
  );
}
