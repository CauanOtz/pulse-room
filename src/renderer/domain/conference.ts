export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'reconnecting';

/**
 * How well somebody's audio is getting through, as the server sees it. It is
 * worth drawing because a bad call is nearly always one person's line, and the
 * room can only stop blaming itself once it can see whose.
 */
export type SignalQuality = 'excellent' | 'good' | 'poor' | 'lost' | 'unknown';

export interface Participant {
  id: string;
  name: string;
  initials: string;
  accent: string;
  isLocal: boolean;
  isMuted: boolean;
  isSpeaking: boolean;
  volume: number;
  locallyMuted: boolean;
  microphoneStream?: MediaStream;
  screenStream?: MediaStream;
  /**
   * True while they have a screen on the wire, whether or not this client is
   * receiving it. Somebody who is not watching still has to be told there is
   * something to watch.
   */
  isBroadcasting: boolean;
  /** Absent until the server has said something about their line. */
  signal?: SignalQuality;
}

export interface ConferenceSnapshot {
  connectionState: ConnectionState;
  participants: Participant[];
  microphoneEnabled: boolean;
  deafened: boolean;
  screenSharing: boolean;
  /**
   * Whose screens this client asked to receive. Video is the expensive part of
   * a call, so one arrives only when somebody says they want to look at it, and
   * two arrive only when somebody wants both.
   */
  watching: string[];
  error?: string;
}

export interface VoiceChannel {
  id: string;
  name: string;
  /** Shown with a lock, since not everyone in the server can enter. */
  private?: boolean;
}

export const voiceChannels: VoiceChannel[] = [
  { id: 'lounge', name: 'Lounge' },
  { id: 'game-room', name: 'Game room' },
];

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
