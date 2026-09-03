import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { Bell, Search, Users } from 'lucide-react';
import type { UpdateStatus } from '../shared/desktop-api';
import { ConferenceController } from './application/conference-controller';
import { CallControls } from './components/call-controls';
import { ChannelSidebar } from './components/channel-sidebar';
import { ParticipantList } from './components/participant-list';
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

  const joined = snapshot.connectionState !== 'disconnected';
  const broadcasters = useMemo(
    () => snapshot.participants.filter((participant) => participant.screenStream),
    [snapshot.participants],
  );

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
        participantCount={snapshot.participants.length}
        displayName={settings.displayName}
        microphoneEnabled={snapshot.microphoneEnabled}
        deafened={snapshot.deafened}
        onOpenSettings={() => setSettingsOpen(true)}
      />

      <main className="room-main">
        <header className="room-header">
          <div className="room-title"><span>#</span><strong>lounge</strong><i />A room for games, films, and unfinished stories.</div>
          <div className="header-actions">
            <button type="button" aria-label="Notifications"><Bell size={18} /></button>
            <button type="button" aria-label="Members"><Users size={19} /></button>
            <label className="search-box"><Search size={15} /><input aria-label="Search" placeholder="Search" /></label>
          </div>
        </header>

        <div className="room-content">
          <Stage
            participants={snapshot.participants}
            joined={joined}
            speakerDeviceId={settings.speakerDeviceId}
            expandLevels={settings.expandScreenLevels}
          />
          {snapshot.error && <div className="error-banner" role="alert">{snapshot.error}</div>}
          <CallControls
            joined={joined}
            microphoneEnabled={snapshot.microphoneEnabled}
            deafened={snapshot.deafened}
            screenSharing={snapshot.screenSharing}
            busy={busy}
            onJoin={() => void run(() => controller.join())}
            onLeave={() => void run(() => controller.gateway.leave())}
            onToggleMicrophone={() => void run(() => controller.toggleMicrophone())}
            onToggleDeafen={() => void run(() => controller.toggleDeafen())}
            onShare={handleShareRequest}
            onOpenSettings={() => setSettingsOpen(true)}
          />
          {broadcasters.length > 0 && (
            <span className="share-caption">
              {broadcasters.length === 1
                ? `${broadcasters[0].name} is sharing full-screen audio`
                : `${broadcasters.length} screens are live · pick one on the stage`}
            </span>
          )}
        </div>
      </main>

      <ParticipantList
        participants={snapshot.participants}
        speakerDeviceId={settings.speakerDeviceId}
        onVolumeChange={(participantId, volume) => controller.gateway.setParticipantVolume(participantId, volume)}
      />

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
