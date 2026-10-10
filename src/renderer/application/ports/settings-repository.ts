import type { ScreenSharePresetName, VoiceDelayName } from '../../domain/conference';

export interface UserSettings {
  displayName: string;
  roomId: string;
  microphoneDeviceId?: string;
  speakerDeviceId?: string;
  microphoneGain: number;
  noiseSuppression: boolean;
  /** RNNoise on the microphone, ahead of the gate. */
  voiceIsolation: boolean;
  noiseGate: number;
  echoCancellation: boolean;
  autoGainControl: boolean;
  expandScreenLevels: boolean;
  roomSounds: boolean;
  screenSharePreset: ScreenSharePresetName;
  voiceDelay: VoiceDelayName;
}

export interface SettingsRepository {
  load(): UserSettings;
  save(settings: UserSettings): void;
}
