import { describe, expect, it } from 'vitest';
import { LocalSettingsRepository, defaultSettings } from '../../src/renderer/infrastructure/persistence/local-settings-repository';

describe('LocalSettingsRepository', () => {
  it('returns safe defaults when no settings are stored', () => {
    localStorage.clear();
    expect(new LocalSettingsRepository().load()).toEqual(defaultSettings);
  });

  it('persists and restores user settings', () => {
    localStorage.clear();
    const repository = new LocalSettingsRepository();
    const settings = { ...defaultSettings, displayName: 'Alex', screenSharePreset: 'motion' as const };
    repository.save(settings);
    expect(repository.load()).toEqual(settings);
  });

  it('recovers from invalid persisted JSON', () => {
    localStorage.setItem('pulse-room:settings:v1', '{broken');
    expect(new LocalSettingsRepository().load()).toEqual(defaultSettings);
  });
});
