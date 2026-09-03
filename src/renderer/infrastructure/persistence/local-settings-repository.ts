import type { SettingsRepository, UserSettings } from '../../application/ports/settings-repository';

export const defaultSettings: UserSettings = {
  displayName: 'You',
  roomId: 'lounge',
  microphoneGain: 100,
  noiseSuppression: true,
  noiseGate: 60,
  echoCancellation: true,
  autoGainControl: true,
  expandScreenLevels: false,
  roomSounds: true,
  screenSharePreset: 'balanced',
};

export class LocalSettingsRepository implements SettingsRepository {
  private static readonly storageKey = 'pulse-room:settings:v1';

  public constructor(
    private readonly storage: Storage = window.localStorage,
    private readonly accountId?: string,
  ) {}
  private get key(): string {
    return this.accountId
      ? `${LocalSettingsRepository.storageKey}:${this.accountId}`
      : LocalSettingsRepository.storageKey;
  }

  public load(): UserSettings {
    const value = this.storage.getItem(this.key);
    if (!value) return defaultSettings;

    try {
      return { ...defaultSettings, ...(JSON.parse(value) as Partial<UserSettings>) };
    } catch {
      return defaultSettings;
    }
  }

  public save(settings: UserSettings): void {
    this.storage.setItem(this.key, JSON.stringify(settings));
  }
}
