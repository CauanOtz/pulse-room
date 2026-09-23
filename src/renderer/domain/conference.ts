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

/**
 * What the receiver had to do to keep somebody's voice playing.
 *
 * A voice that sounds like wind is almost never the microphone. It is the
 * receiver inventing audio to cover a packet that did not arrive in time, and
 * that invention is counted, so the room can say whose line it is rather than
 * everybody guessing at each other's headphones.
 */
export interface ParticipantHealth {
  id: string;
  name: string;
  /** Share of the audio played that nobody sent: the receiver made it up. */
  concealedPercent?: number;
  packetsLost?: number;
  /** How unevenly their packets arrive. */
  jitterMs?: number;
  /** How long their voice is actually being held before it is played. */
  jitterBufferMs?: number;
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
  /** How much slack the capture buffer is allowed. Zero asks for none. */
  latencyHint?: AudioContextLatencyCategory | number;
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

/**
 * How long a voice is allowed to wait on this machine before it is played.
 *
 * Two buffers decide this and they are worth naming separately, because the
 * one that looks important is not the one that costs the most.
 *
 * The first is the jitter buffer. Everything that crosses a network arrives
 * unevenly and the receiver holds a little of it back so a late packet still
 * has somewhere to go. Asking for none of it does not get none: measured on a
 * loopback with no network at all, the receiver still held about 29 ms,
 * because it cannot hand out less than the packets arrive in.
 *
 * The second is the sound card's own buffer, and on this machine it was the
 * larger of the two by a long way: 46 ms at the hint every guide recommends,
 * and 5 ms when asked for nothing at all. That is the difference between a
 * room that feels like a telephone and one that feels like the next chair.
 *
 * The third thing this moves is the Opus frame. Every packet carries a fixed
 * slice of time, twenty milliseconds by default, and those are spent before a
 * byte leaves. Asking for ten was measured at seventeen milliseconds off the
 * whole trip, paid for in twice as many packets.
 *
 * A short buffer is a buffer with no slack, so a machine that stalls has
 * nowhere to hide it and the listener hears a click; and twice the packets on
 * a line that is already losing them is the wrong way round. Which is why this
 * is a choice and not a constant.
 */
export const voiceDelayPresets = {
  // Nothing is asked of the jitter buffer here, deliberately. Asking for zero
  // was measured as worth about five milliseconds, because the buffer cannot
  // hand out less than the packets arrive in and floors near 29 ms anyway. All
  // it really does is stop an unsteady line from growing itself the slack it
  // needs, and an unsteady line that cannot have that slack conceals the gap
  // instead, which is heard as a wind in somebody's headphones.
  lowest: { seconds: undefined, audioLatency: 0, opusFrameMs: 10, label: 'Lowest delay' },
  balanced: { seconds: 0.08, audioLatency: 'interactive', opusFrameMs: undefined, label: 'Balanced' },
  smooth: { seconds: 0.2, audioLatency: 'playback', opusFrameMs: undefined, label: 'Smoothest' },
} as const;

export type VoiceDelayName = keyof typeof voiceDelayPresets;

export const screenSharePresets = {
  balanced: { width: 1920, height: 1080, frameRate: 30, maxBitrate: 4_500_000, contentHint: 'detail' },
  motion: { width: 1920, height: 1080, frameRate: 60, maxBitrate: 7_000_000, contentHint: 'motion' },
  efficient: { width: 1280, height: 720, frameRate: 30, maxBitrate: 2_500_000, contentHint: 'motion' },
} satisfies Record<string, ScreenShareOptions>;

export type ScreenSharePresetName = keyof typeof screenSharePresets;
