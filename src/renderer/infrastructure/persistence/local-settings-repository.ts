import type { SettingsRepository, UserSettings } from '../../application/ports/settings-repository';

export const defaultSettings: UserSettings = {
  displayName: 'You',
  roomId: 'lounge',
  microphoneGain: 100,
  noiseSuppression: true,
  echoCancellation: true,
  autoGainControl: true,
  screenSharePreset: 'balanced',
};

export class LocalSettingsRepository implements SettingsRepository {
  private static readonly storageKey = 'pulse-room:settings:v1';

  public constructor(private readonly storage: Storage = window.localStorage) {}

  public load(): UserSettings {
    const value = this.storage.getItem(LocalSettingsRepository.storageKey);
    if (!value) return defaultSettings;

    try {
      return { ...defaultSettings, ...(JSON.parse(value) as Partial<UserSettings>) };
    } catch {
      return defaultSettings;
    }
  }

  public save(settings: UserSettings): void {
    this.storage.setItem(LocalSettingsRepository.storageKey, JSON.stringify(settings));
  }
}
