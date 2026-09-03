import type {
  ConferenceSnapshot,
  JoinRoomCommand,
  MicrophoneOptions,
  ScreenShareOptions,
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
}
