import type { ConferenceGateway } from '../../application/ports/conference-gateway';
import type { ConferenceSnapshot } from '../../domain/conference';
import { patchChangesNothing } from './snapshot-diff';

export abstract class ObservableConference implements ConferenceGateway {
  // The microphone only counts as enabled once a track is really live, so the
  // controls never promise the room can hear someone who is not publishing.
  protected snapshot: ConferenceSnapshot = {
    connectionState: 'disconnected',
    participants: [],
    microphoneEnabled: false,
    deafened: false,
    screenSharing: false,
    watching: [],
  };

  private readonly listeners = new Set<() => void>();

  public subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  public getSnapshot(): ConferenceSnapshot {
    return this.snapshot;
  }

  /**
   * A room event that says nothing new wakes nobody. The call reports active
   * speakers and connection quality several times a second, and almost all of
   * those reports repeat what the interface is already showing.
   */
  protected update(patch: Partial<ConferenceSnapshot>): void {
    if (patchChangesNothing(this.snapshot, patch)) return;
    this.snapshot = { ...this.snapshot, ...patch };
    this.listeners.forEach((listener) => listener());
  }

  public abstract join(command: import('../../domain/conference').JoinRoomCommand): Promise<void>;
  public abstract leave(): Promise<void>;
  public abstract setMicrophoneEnabled(
    enabled: boolean,
    options: import('../../domain/conference').MicrophoneOptions,
  ): Promise<void>;
  public abstract applyMicrophoneOptions(
    options: import('../../domain/conference').MicrophoneOptions,
  ): Promise<void>;
  public abstract setDeafened(deafened: boolean): Promise<void>;
  public abstract startScreenShare(
    options: import('../../domain/conference').ScreenShareOptions,
  ): Promise<void>;
  public abstract stopScreenShare(): Promise<void>;
  public abstract setParticipantVolume(participantId: string, volume: number): void;
  public abstract setParticipantMuted(participantId: string, muted: boolean): void;
  public abstract watchScreen(participantId: string, watching: boolean): void;
  public abstract previewScreen(participantId?: string): void;
  public abstract setVoiceDelay(
    delay: import('../../domain/conference').VoiceDelayName,
  ): void;
  public abstract readHealth(): Promise<
    import('../../domain/conference').ParticipantHealth[]
  >;
}
