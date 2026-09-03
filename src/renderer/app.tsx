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
import { MediaDevicesService, type AvailableMediaDevices } from './infrastructure/media/media-devices-service';
import { LocalSettingsRepository } from './infrastructure/persistence/local-settings-repository';

const settingsRepository = new LocalSettingsRepository();
const controller = new ConferenceController(ConferenceGatewayFactory.create(), settingsRepository);
const mediaDevicesService = new MediaDevicesService();
const roomSoundPlayer = new RoomSoundPlayer();
const presenceClient = ConferenceGatewayFactory.createPresenceClient();

export function App() {
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
  const [openParticipant, setOpenParticipant] = useState<{ id: string; position: { x: number; y: number } }>();

  const joined = snapshot.connectionState !== 'disconnected';
  const activeChannel = voiceChannels.find((channel) => channel.id === settings.roomId);
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
  }, [broadcasters, settings.roomSounds, snapshot.connectionState, snapshot.microphoneEnabled, snapshot.participants]);

  // Rooms this client did not join can only be seen through the service.
  useEffect(() => {
    if (!presenceClient.available) return undefined;
    let active = true;
    const read = () => void presenceClient.read().then((rooms) => active && setOccupancy(rooms));
    read();
    const timer = setInterval(read, 3_000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [snapshot.connectionState]);

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
    if (channelId === settings.roomId && joined) return;
    setSettings((current) => ({ ...current, roomId: channelId }));
    void run(() => controller.enterRoom(channelId));
  };

  const handleShareRequest = () => {
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
    setSettings(nextSettings);
    setSettingsOpen(false);
    void run(() => controller.saveSettings(nextSettings));
  };

  return (
    <div className="app-shell">
      <VideoLevelFilter />
      <ServerRail />
      <ChannelSidebar
        connectionState={snapshot.connectionState}
        channels={voiceChannels}
        activeChannelId={settings.roomId}
        participants={snapshot.participants}
        displayName={settings.displayName}
        microphoneEnabled={snapshot.microphoneEnabled}
        deafened={snapshot.deafened}
        joined={joined}
        busy={busy}
        occupancy={occupancy}
        onToggleMicrophone={() => void run(() => controller.toggleMicrophone())}
        onToggleDeafen={() => void run(() => controller.toggleDeafen())}
        onSelectChannel={handleChannelSelect}
        onOpenParticipant={(entry, position) => setOpenParticipant({ id: entry.id, position })}
        onOpenSettings={() => setSettingsOpen(true)}
      />

      <main className="room-main">
        <header className="room-header">
          <div className="room-title">
            <span>#</span>
            <strong>{activeChannel?.name ?? settings.roomId}</strong>
            <i />A room for games, films, and unfinished stories.
          </div>
        </header>

        <div className="room-content">
          <Stage
            participants={snapshot.participants}
            joined={joined}
            speakerDeviceId={settings.speakerDeviceId}
            expandLevels={settings.expandScreenLevels}
          >
            {joined && (
              <CallControls
                screenSharing={snapshot.screenSharing}
                busy={busy}
                onLeave={() => void run(() => controller.gateway.leave())}
                onShare={handleShareRequest}
                onOpenSettings={() => setSettingsOpen(true)}
              />
            )}
          </Stage>
          {snapshot.error && <div className="error-banner" role="alert">{snapshot.error}</div>}
          {broadcasters.length > 0 && (
            <span className="share-caption">
              {broadcasters.length === 1
                ? `${broadcasters[0].name} is sharing full-screen audio`
                : `${broadcasters.length} screens are live · pick one on the stage`}
            </span>
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

      <SourcePicker open={sourcePickerOpen} onClose={() => setSourcePickerOpen(false)} onSelect={handleSourceSelected} />
      <SettingsDialog
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
