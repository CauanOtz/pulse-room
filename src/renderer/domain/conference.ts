export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'reconnecting';

export interface Participant {
  id: string;
  name: string;
  initials: string;
  accent: string;
  isLocal: boolean;
  isMuted: boolean;
  isSpeaking: boolean;
  volume: number;
  microphoneStream?: MediaStream;
  screenStream?: MediaStream;
}

export interface ConferenceSnapshot {
  connectionState: ConnectionState;
  participants: Participant[];
  microphoneEnabled: boolean;
  deafened: boolean;
  screenSharing: boolean;
  error?: string;
}

export interface JoinRoomCommand {
  roomId: string;
  participantName: string;
}

export interface ScreenShareOptions {
  width: number;
  height: number;
  frameRate: number;
  maxBitrate: number;
}

export interface MicrophoneOptions {
  deviceId?: string;
  gain: number;
  echoCancellation: boolean;
  noiseSuppression: boolean;
  autoGainControl: boolean;
}

export const screenSharePresets = {
  balanced: { width: 1920, height: 1080, frameRate: 30, maxBitrate: 4_500_000 },
  motion: { width: 1920, height: 1080, frameRate: 60, maxBitrate: 7_000_000 },
  efficient: { width: 1280, height: 720, frameRate: 30, maxBitrate: 2_500_000 },
} satisfies Record<string, ScreenShareOptions>;

export type ScreenSharePresetName = keyof typeof screenSharePresets;
