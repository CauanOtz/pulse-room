import type { ConferenceGateway } from './ports/conference-gateway';
import type { SettingsRepository, UserSettings } from './ports/settings-repository';
import { noiseGateThresholdDb, screenSharePresets } from '../domain/conference';
import type { MicrophoneOptions } from '../domain/conference';

export class ConferenceController {
  public constructor(
    public readonly gateway: ConferenceGateway,
    private readonly settingsRepository: SettingsRepository,
  ) {}

  public getSettings(): UserSettings {
    return this.settingsRepository.load();
  }

  public async saveSettings(settings: UserSettings): Promise<void> {
    this.settingsRepository.save(settings);
    const snapshot = this.gateway.getSnapshot();
    if (snapshot.connectionState === 'connected') {
      await this.gateway.applyMicrophoneOptions(this.microphoneOptions(settings));
    }
  }

  public async join(roomId?: string): Promise<void> {
    const settings = this.getSettings();
    await this.gateway.join({
      roomId: roomId ?? settings.roomId,
      participantName: settings.displayName,
    });
    await this.gateway.setMicrophoneEnabled(true, this.microphoneOptions(settings));
  }

  /** Clicking a voice channel is the whole act of joining it. */
  public async enterRoom(roomId: string): Promise<void> {
    const settings = { ...this.getSettings(), roomId };
    this.settingsRepository.save(settings);
    if (this.gateway.getSnapshot().connectionState !== 'disconnected') {
      await this.gateway.leave();
    }
    await this.join(roomId);
  }

  public async toggleMicrophone(): Promise<void> {
    const settings = this.getSettings();
    const enabled = !this.gateway.getSnapshot().microphoneEnabled;
    await this.gateway.setMicrophoneEnabled(enabled, this.microphoneOptions(settings));
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

  private microphoneOptions(settings: UserSettings): MicrophoneOptions {
    return {
      deviceId: settings.microphoneDeviceId,
      gain: settings.microphoneGain / 100,
      echoCancellation: settings.echoCancellation,
      noiseSuppression: settings.noiseSuppression,
      autoGainControl: settings.autoGainControl,
      noiseGateThreshold: noiseGateThresholdDb(settings.noiseGate),
    };
  }
}
