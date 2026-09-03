import type { ConferenceGateway } from './ports/conference-gateway';
import type { SettingsRepository, UserSettings } from './ports/settings-repository';
import { screenSharePresets } from '../domain/conference';

export class ConferenceController {
  public constructor(
    public readonly gateway: ConferenceGateway,
    private readonly settingsRepository: SettingsRepository,
  ) {}

  public getSettings(): UserSettings {
    return this.settingsRepository.load();
  }

  public saveSettings(settings: UserSettings): void {
    this.settingsRepository.save(settings);
  }

  public async join(): Promise<void> {
    const settings = this.getSettings();
    await this.gateway.join({ roomId: settings.roomId, participantName: settings.displayName });
    await this.gateway.setMicrophoneEnabled(true, {
      deviceId: settings.microphoneDeviceId,
      gain: settings.microphoneGain / 100,
      echoCancellation: settings.echoCancellation,
      noiseSuppression: settings.noiseSuppression,
      autoGainControl: settings.autoGainControl,
    });
  }

  public async toggleMicrophone(): Promise<void> {
    const settings = this.getSettings();
    const enabled = !this.gateway.getSnapshot().microphoneEnabled;
    await this.gateway.setMicrophoneEnabled(enabled, {
      deviceId: settings.microphoneDeviceId,
      gain: settings.microphoneGain / 100,
      echoCancellation: settings.echoCancellation,
      noiseSuppression: settings.noiseSuppression,
      autoGainControl: settings.autoGainControl,
    });
  }

  public async toggleDeafen(): Promise<void> {
    await this.gateway.setDeafened(!this.gateway.getSnapshot().deafened);
  }

  public async toggleScreenShare(sourceId?: string): Promise<void> {
    if (this.gateway.getSnapshot().screenSharing) {
      await this.gateway.stopScreenShare();
      return;
    }

    if (sourceId && window.desktop) {
      await window.desktop.capture.selectSource(sourceId);
    }

    const preset = screenSharePresets[this.getSettings().screenSharePreset];
    await this.gateway.startScreenShare(preset);
  }
}
