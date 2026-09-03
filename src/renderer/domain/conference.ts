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
  /**
   * What the encoder should protect when it cannot have everything. 'detail'
   * keeps text sharp and spends its whole budget doing so; 'motion' accepts
   * softer frames and can therefore send far less than its ceiling.
   */
  contentHint: 'detail' | 'motion';
}

export interface MicrophoneOptions {
  deviceId?: string;
  gain: number;
  echoCancellation: boolean;
  noiseSuppression: boolean;
  autoGainControl: boolean;
  noiseGateThreshold: number;
}

/**
 * Turns the friendly 0-100 strength into the level in decibels below which the
 * microphone is treated as silence. Room tone usually sits near -55 dBFS.
 */
export function noiseGateThresholdDb(strength: number): number {
  const bounded = Math.min(100, Math.max(0, strength));
  return -80 + (bounded / 100) * 50;
}

export const screenSharePresets = {
  balanced: { width: 1920, height: 1080, frameRate: 30, maxBitrate: 4_500_000, contentHint: 'detail' },
  motion: { width: 1920, height: 1080, frameRate: 60, maxBitrate: 7_000_000, contentHint: 'motion' },
  efficient: { width: 1280, height: 720, frameRate: 30, maxBitrate: 2_500_000, contentHint: 'motion' },
} satisfies Record<string, ScreenShareOptions>;

export type ScreenSharePresetName = keyof typeof screenSharePresets;
