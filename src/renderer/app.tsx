import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import type { UpdateStatus } from '../shared/desktop-api';
import { ConferenceController } from './application/conference-controller';
import { emptyPresence, presenceSounds, type RoomPresence } from './application/room-presence';
import { voiceChannels } from './domain/conference';
import type { ChannelOccupancy, RosterEntry } from './domain/roster';
import { RoomSoundPlayer } from './infrastructure/media/room-sound-player';
import { CallControls } from './components/call-controls';
import { ChannelSidebar } from './components/channel-sidebar';
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

const mediaDevicesService = new MediaDevicesService();
const roomSoundPlayer = new RoomSoundPlayer();

export function App({ workspace }: { workspace?: WorkspaceBindings }) {
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
    <div className="app-shell">
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
        displayName={settings.displayName}
        microphoneEnabled={snapshot.microphoneEnabled}
        deafened={snapshot.deafened}
        joined={joined}
        busy={busy}
        screenSharing={snapshot.screenSharing}
        devices={devices}
        microphoneDeviceId={settings.microphoneDeviceId}
        speakerDeviceId={settings.speakerDeviceId}
        occupancy={occupancy}
        onToggleMicrophone={() => canSpeak && void run(() => controller.toggleMicrophone())}
        onToggleDeafen={() => void run(() => controller.toggleDeafen())}
        onSelectMicrophone={(deviceId) => handleSettingsSaved({ ...settings, microphoneDeviceId: deviceId })}
        onSelectSpeaker={(deviceId) => handleSettingsSaved({ ...settings, speakerDeviceId: deviceId })}
        onLeave={() => void run(() => controller.gateway.leave())}
        onShare={handleShareRequest}
        onSelectChannel={handleChannelSelect}
        onOpenParticipant={(entry, position) => setOpenParticipant({ id: entry.id, position })}
        onOpenSettings={() => setSettingsOpen(true)}
      />

      <main className="room-main">
        <header className="room-header">
          <div className="room-title">
            <span>#</span>
            <strong>{textChannel?.name ?? activeChannel?.name ?? 'Choose a channel'}</strong>
            <i />
            {workspace ? workspace.detail.server.name : 'A room for games, films, and unfinished stories.'}
            {joined && textChannel && (
              <button onClick={() => setViewId(settings.roomId)}>Return to call</button>
            )}
          </div>
        </header>

        <div className="room-content">
          {textChannel && workspace ? (
            <TextChat
              key={textChannel.id}
              api={workspace.api}
              user={workspace.user}
              channel={textChannel}
              manager={manager}
            />
          ) : (
            <Stage
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
          )}
          {joined && !canSpeak && (
            <p className="permission-note">
              You can listen in this channel. Speaking is restricted by its permissions.
            </p>
          )}
          {joined && !canShare && (
            <p className="permission-note">Screen sharing is restricted in this channel.</p>
          )}
          {snapshot.error && (
            <div className="error-banner" role="alert">
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
    <svg className="filter-defs" aria-hidden="true" focusable="false">
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
