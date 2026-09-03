import type { ConferenceGateway } from '../../application/ports/conference-gateway';
import type { ConferenceSnapshot } from '../../domain/conference';

export abstract class ObservableConference implements ConferenceGateway {
  protected snapshot: ConferenceSnapshot = {
    connectionState: 'disconnected',
    participants: [],
    microphoneEnabled: true,
    deafened: false,
    screenSharing: false,
  };

  private readonly listeners = new Set<() => void>();

  public subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  public getSnapshot(): ConferenceSnapshot {
    return this.snapshot;
  }

  protected update(patch: Partial<ConferenceSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...patch };
    this.listeners.forEach((listener) => listener());
  }

  public abstract join(command: import('../../domain/conference').JoinRoomCommand): Promise<void>;
  public abstract leave(): Promise<void>;
  public abstract setMicrophoneEnabled(
    enabled: boolean,
    options: import('../../domain/conference').MicrophoneOptions,
  ): Promise<void>;
  public abstract setDeafened(deafened: boolean): Promise<void>;
  public abstract startScreenShare(
    options: import('../../domain/conference').ScreenShareOptions,
  ): Promise<void>;
  public abstract stopScreenShare(): Promise<void>;
  public abstract setParticipantVolume(participantId: string, volume: number): void;
}
