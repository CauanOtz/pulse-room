import type {
  ConferenceSnapshot,
  JoinRoomCommand,
  MicrophoneOptions,
  ScreenShareOptions,
  VoiceDelayName,
} from '../../domain/conference';

export interface ConferenceGateway {
  subscribe(listener: () => void): () => void;
  getSnapshot(): ConferenceSnapshot;
  join(command: JoinRoomCommand): Promise<void>;
  leave(): Promise<void>;
  setMicrophoneEnabled(enabled: boolean, options: MicrophoneOptions): Promise<void>;
  applyMicrophoneOptions(options: MicrophoneOptions): Promise<void>;
  setDeafened(deafened: boolean): Promise<void>;
  startScreenShare(options: ScreenShareOptions): Promise<void>;
  stopScreenShare(): Promise<void>;
  setParticipantVolume(participantId: string, volume: number): void;
  setParticipantMuted(participantId: string, muted: boolean): void;
  /** Asks for somebody's screen, or gives it back. Others are left as they are. */
  watchScreen(participantId: string, watching: boolean): void;
  /** Borrows a screen for as long as it is being looked at in passing. */
  previewScreen(participantId?: string): void;
  /** How long a voice may wait on this machine before it is played. */
  setVoiceDelay(delay: VoiceDelayName): void;
}
