import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import type { UpdateStatus } from '../shared/desktop-api';
import { ConferenceController } from './application/conference-controller';
import { emptyPresence, presenceSounds, type RoomPresence } from './application/room-presence';
import { voiceChannels } from './domain/conference';
import { accountOf, type ChannelOccupancy, type RosterEntry } from './domain/roster';
import { RoomSoundPlayer } from './infrastructure/media/room-sound-player';
import { CallControls } from './components/call-controls';
import { ChannelSidebar } from './components/channel-sidebar';
import { ProfileBar } from './components/profile-bar';
import { ParticipantPopover } from './components/participant-popover';
import { RoomAudio } from './components/room-audio';
import { ServerRail } from './components/server-rail';
import { SettingsDialog } from './components/settings-dialog';
import { SourcePicker } from './components/source-picker';
import { Stage } from './components/stage';
import { ConferenceGatewayFactory } from './infrastructure/conference/conference-gateway-factory';
import {
  MediaDevicesService,
  type AvailableMediaDevices,
} from './infrastructure/media/media-devices-service';
import { LocalSettingsRepository } from './infrastructure/persistence/local-settings-repository';
import type { WorkspaceBindings } from './community-root';
import { canManage } from '../shared/community';
import { TextChat } from './components/text-chat';
import { MemberSidebar } from './components/member-sidebar';

const mediaDevicesService = new MediaDevicesService();
const roomSoundPlayer = new RoomSoundPlayer();

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
  }, [workspace?.api, workspace?.user.id, workspace?.detail.server.id]);
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
  const [sourcePickerOpen, setSourcePickerOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [version, setVersion] = useState(__APP_VERSION__);
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus>({ state: 'idle' });
  const [devices, setDevices] = useState<AvailableMediaDevices>({ microphones: [], speakers: [] });
  const [occupancy, setOccupancy] = useState<ChannelOccupancy[]>([]);
  const [openParticipant, setOpenParticipant] = useState<{
    id: string;
    position: { x: number; y: number };
  }>();

  const joined = snapshot.connectionState !== 'disconnected';
  const activeChannel = channels.find((channel) => channel.id === settings.roomId);
  const currentVoice = workspace?.detail.channels.find((c) => c.id === settings.roomId);
  const manager = canManage(workspace?.detail.server.role);
  const canSpeak = !workspace || manager || Boolean(currentVoice?.allowSpeak);
  const canShare = !workspace || manager || Boolean(currentVoice?.allowShare);
  useEffect(() => {
    if (!workspace || !joined) return;
    if (!currentVoice) {
      void controller.gateway.leave();
      return;
    }
    if (!canSpeak && snapshot.microphoneEnabled) void controller.toggleMicrophone();
    if (!canShare && snapshot.screenSharing) void controller.gateway.stopScreenShare();
  }, [
    currentVoice,
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
        ...snapshot.participants.map((participant) => accountOf(participant.id)),
      ]),
    [occupancy, snapshot.participants],
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
    const participant = snapshot.participants.find((each) => each.id === openParticipant?.id);
    if (!participant) return undefined;
    return {
      id: participant.id,
      name: participant.name,
      initials: participant.initials,
      accent: participant.accent,
      isLocal: participant.isLocal,
      isMuted: participant.isMuted,
      isSpeaking: participant.isSpeaking,
      volume: participant.volume,
      locallyMuted: participant.locallyMuted,
      detailed: true,
    };
  }, [openParticipant?.id, snapshot.participants]);

  const handleChannelSelect = (channelId: string) => {
    setViewId(channelId);
    if (channelId === settings.roomId && joined) return;
    setSettings((current) => ({ ...current, roomId: channelId }));
    void run(() => controller.enterRoom(channelId));
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
    <div className="app-shell grid h-full w-full grid-cols-[72px_240px_minmax(0,1fr)] grid-rows-[minmax(0,1fr)_auto] bg-background text-foreground">
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
        participants={snapshot.participants}
        avatars={avatars}
        joined={joined}
        busy={busy}
        screenSharing={snapshot.screenSharing}
        occupancy={occupancy}
        onLeave={() => void run(() => controller.gateway.leave())}
        onShare={handleShareRequest}
        onSelectChannel={handleChannelSelect}
        onOpenParticipant={(entry, position) => setOpenParticipant({ id: entry.id, position })}
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
        <header className="room-header flex h-12 flex-none items-center gap-2 border-b border-border px-4 text-sm">
          <div className="room-title flex min-w-0 items-center gap-2">
            <span>#</span>
            <strong>{textChannel?.name ?? activeChannel?.name ?? 'Choose a channel'}</strong>
            <i />
            <span className="room-description min-w-0 truncate border-l border-border pl-2 text-xs text-muted-foreground">
              {workspace ? workspace.detail.server.name : 'A room for games, films, and unfinished stories.'}
            </span>
            {joined && textChannel && (
              <button onClick={() => setViewId(settings.roomId)}>Return to call</button>
            )}
          </div>
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
              <MemberSidebar
                members={workspace.detail.members}
                userId={workspace.user.id}
                voiceIds={inVoice}
              />
            </div>
          ) : (
            // The room is a card of its own, inset from the window.
            <div className="flex min-h-0 min-w-0 p-2">
              <Stage
                avatars={avatars}
                participants={snapshot.participants}
                joined={joined}
                speakerDeviceId={settings.speakerDeviceId}
                expandLevels={settings.expandScreenLevels}
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
                    onLeave={() => void run(() => controller.gateway.leave())}
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
        </div>
      </main>

      <RoomAudio participants={snapshot.participants} speakerDeviceId={settings.speakerDeviceId} />

      {popoverEntry && openParticipant && (
        <ParticipantPopover
          entry={popoverEntry}
          position={openParticipant.position}
          onVolumeChange={(volume) => controller.gateway.setParticipantVolume(popoverEntry.id, volume)}
          onMutedChange={(muted) => controller.gateway.setParticipantMuted(popoverEntry.id, muted)}
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
        onClose={() => setSettingsOpen(false)}
        onSave={handleSettingsSaved}
        onCheckUpdates={() => window.desktop && void window.desktop.updates.check().then(setUpdateStatus)}
        onInstallUpdate={() => window.desktop && void window.desktop.updates.install()}
      />
    </div>
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
