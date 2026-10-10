import type {
  ConferenceSnapshot,
  ConnectionReport,
  JoinRoomCommand,
  MicrophoneOptions,
  ParticipantHealth,
  ScreenShareOptions,
  VoiceDelayName,
} from '../../domain/conference';

export interface ConferenceGateway {
  subscribe(listener: () => void): () => void;
  getSnapshot(): ConferenceSnapshot;
  /**
   * Fetches what joining a room needs before anybody has asked to join it.
   * Nothing happens to the call; a guess that is never used costs nothing.
   */
  prepare(command: JoinRoomCommand): void;
  /** Opens the microphone for the call about to start, while it connects. */
  prepareMicrophone(options: MicrophoneOptions): void;
  join(command: JoinRoomCommand): Promise<void>;
  leave(): Promise<void>;
  setMicrophoneEnabled(enabled: boolean, options: MicrophoneOptions): Promise<void>;
  applyMicrophoneOptions(options: MicrophoneOptions): Promise<void>;
  setDeafened(deafened: boolean): Promise<void>;
  startScreenShare(options: ScreenShareOptions): Promise<void>;
  /** Retunes the active video track without ending or republishing the screen share. */
  updateScreenShare(options: ScreenShareOptions): Promise<void>;
  stopScreenShare(): Promise<void>;
  setParticipantVolume(participantId: string, volume: number): void;
  setParticipantMuted(participantId: string, muted: boolean): void;
  /** Asks for somebody's screen, or gives it back. Others are left as they are. */
  watchScreen(participantId: string, watching: boolean): void;
  /** Borrows a screen for as long as it is being looked at in passing. */
  previewScreen(participantId?: string): void;
  /** How long a voice may wait on this machine before it is played. */
  setVoiceDelay(delay: VoiceDelayName): void;
  /** What it is costing this machine to keep everybody else audible. */
  readHealth(): Promise<ParticipantHealth[]>;
  /** This machine's own line to the voice server, over the last few minutes. */
  readConnection(): Promise<ConnectionReport>;
}
