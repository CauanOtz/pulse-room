import type { SettingsRepository, UserSettings } from '../../application/ports/settings-repository';

export const defaultSettings: UserSettings = {
  displayName: 'You',
  roomId: 'lounge',
  microphoneGain: 100,
  noiseSuppression: true,
  // A fan or a keyboard behind every voice is what a room sounds like without
  // it, and the browser's own filter does not reach them. Krisp where the
  // voice server allows it, the network this client carries where it does not.
  voiceIsolation: true,
  noiseGate: 60,
  echoCancellation: true,
  autoGainControl: true,
  expandScreenLevels: false,
  roomSounds: true,
  screenSharePreset: 'balanced',
  // A default that sounds wrong on one machine in five is the wrong default,
  // whatever it measures. Balanced keeps the shorter Opus frame and the
  // receiver's own judgement, and leaves only the sound card's own buffer to
  // whoever wants to gamble their machine can keep up with it.
  voiceDelay: 'balanced',
};

/**
 * Settings saved before voice isolation became the default have it off only
 * because it used to start off, not because anybody chose that, so it is
 * turned on once. Settings saved since carry this mark and are left alone.
 */
const isolationRevision = 2;

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
      const { isolationRevision: revision, ...stored } = JSON.parse(value) as Partial<UserSettings> & {
        isolationRevision?: number;
      };
      return {
        ...defaultSettings,
        ...stored,
        ...(revision === isolationRevision ? {} : { voiceIsolation: true }),
      };
    } catch {
      return defaultSettings;
    }
  }

  public save(settings: UserSettings): void {
    this.storage.setItem(this.key, JSON.stringify({ ...settings, isolationRevision }));
  }
}
