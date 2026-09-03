import type {
  JoinRoomCommand,
  MicrophoneOptions,
  Participant,
  ScreenShareOptions,
} from '../../domain/conference';
import { ObservableConference } from './observable-conference';
import { createDisplayMediaOptions } from '../media/display-media-options';
import { MicrophoneTrackFactory, type ProcessedMicrophoneTrack } from '../media/microphone-track-factory';

const demoFriends: Participant[] = [
  {
    id: 'maya',
    name: 'Maya',
    initials: 'MA',
    accent: '#ee8d72',
    isLocal: false,
    isMuted: false,
    isSpeaking: true,
    volume: 80,
  },
  {
    id: 'noah',
    name: 'Noah',
    initials: 'NO',
    accent: '#7c98ed',
    isLocal: false,
    isMuted: false,
    isSpeaking: false,
    volume: 72,
  },
  {
    id: 'leo',
    name: 'Leo',
    initials: 'LE',
    accent: '#7bc6aa',
    isLocal: false,
    isMuted: true,
    isSpeaking: false,
    volume: 100,
  },
];

export class DemoConferenceGateway extends ObservableConference {
  private displayStream?: MediaStream;
  private microphone?: ProcessedMicrophoneTrack;
  private readonly microphoneTrackFactory = new MicrophoneTrackFactory();

  public async join(command: JoinRoomCommand): Promise<void> {
    this.update({ connectionState: 'connecting', error: undefined });
    await Promise.resolve();
    this.update({
      connectionState: 'connected',
      participants: [
        {
          id: 'local',
          name: command.participantName,
          initials: this.getInitials(command.participantName),
          accent: '#a8bdff',
          isLocal: true,
          isMuted: !this.microphone,
          isSpeaking: false,
          volume: 100,
        },
        ...demoFriends,
      ],
    });
  }

  public async leave(): Promise<void> {
    await this.stopScreenShare();
    await this.releaseMicrophone();
    this.update({ connectionState: 'disconnected', participants: [] });
  }

  // The demo transport still opens the real microphone, so the processing
  // chain and the device fallback behave exactly as they do in a live room.
  public async setMicrophoneEnabled(enabled: boolean, options: MicrophoneOptions): Promise<void> {
    await this.releaseMicrophone();

    if (enabled) {
      try {
        this.microphone = await this.microphoneTrackFactory.create(options);
      } catch (error) {
        this.publishMicrophoneState(false);
        this.update({
          error: error instanceof Error ? error.message : 'The microphone could not be opened.',
        });
        throw error;
      }
    }

    this.publishMicrophoneState(enabled);
  }

  private publishMicrophoneState(enabled: boolean): void {
    this.update({
      microphoneEnabled: enabled,
      participants: this.snapshot.participants.map((participant) =>
        participant.isLocal ? { ...participant, isMuted: !enabled } : participant,
      ),
    });
  }

  public async applyMicrophoneOptions(options: MicrophoneOptions): Promise<void> {
    if (!this.microphone) {
      await this.setMicrophoneEnabled(this.snapshot.microphoneEnabled, options);
      return;
    }
    this.microphone.apply(options);
  }

  private async releaseMicrophone(): Promise<void> {
    await this.microphone?.dispose();
    this.microphone = undefined;
  }

  public async setDeafened(deafened: boolean): Promise<void> {
    this.update({ deafened });
  }

  public async startScreenShare(options: ScreenShareOptions): Promise<void> {
    try {
      this.displayStream = await navigator.mediaDevices.getDisplayMedia(
        createDisplayMediaOptions(options),
      );

      const platform = await window.desktop?.app.getPlatform();
      if (platform === 'win32' && this.displayStream.getAudioTracks().length === 0) {
        this.displayStream.getTracks().forEach((track) => track.stop());
        throw new Error('Windows system audio was not captured. Select a full monitor and try again.');
      }

      this.displayStream.getVideoTracks()[0]?.addEventListener('ended', () => {
        void this.stopScreenShare();
      });

      this.update({
        screenSharing: true,
        error: undefined,
        participants: this.snapshot.participants.map((participant) =>
          participant.isLocal ? { ...participant, screenStream: this.displayStream } : participant,
        ),
      });
    } catch (error) {
      this.update({ error: error instanceof Error ? error.message : 'Screen sharing could not start.' });
      throw error;
    }
  }

  public async stopScreenShare(): Promise<void> {
    this.displayStream?.getTracks().forEach((track) => track.stop());
    this.displayStream = undefined;
    this.update({
      screenSharing: false,
      participants: this.snapshot.participants.map((participant) =>
        participant.isLocal ? { ...participant, screenStream: undefined } : participant,
      ),
    });
  }

  public setParticipantVolume(participantId: string, volume: number): void {
    this.update({
      participants: this.snapshot.participants.map((participant) =>
        participant.id === participantId ? { ...participant, volume } : participant,
      ),
    });
  }

  private getInitials(name: string): string {
    return name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join('');
  }
}
