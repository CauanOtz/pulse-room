import type { ScreenSharePresetName } from '../../domain/conference';

export interface UserSettings {
  displayName: string;
  roomId: string;
  microphoneDeviceId?: string;
  speakerDeviceId?: string;
  microphoneGain: number;
  noiseSuppression: boolean;
  noiseGate: number;
  echoCancellation: boolean;
  autoGainControl: boolean;
  expandScreenLevels: boolean;
  screenSharePreset: ScreenSharePresetName;
}

export interface SettingsRepository {
  load(): UserSettings;
  save(settings: UserSettings): void;
}
