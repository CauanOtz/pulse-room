import {
  LocalAudioTrack,
  LocalVideoTrack,
  Room,
  RoomEvent,
  Track,
  type LocalTrackPublication,
  type RemoteParticipant,
  type RemoteTrack,
  type RemoteTrackPublication,
} from 'livekit-client';
import type {
  JoinRoomCommand,
  MicrophoneOptions,
  Participant,
  ScreenShareOptions,
} from '../../domain/conference';
import { ObservableConference } from './observable-conference';
import { createDisplayMediaOptions } from '../media/display-media-options';
import { MicrophoneTrackFactory, type ProcessedMicrophoneTrack } from '../media/microphone-track-factory';

interface TokenResponse {
  serverUrl: string;
  token: string;
}

export interface LiveKitGatewayConfiguration {
  apiUrl: string;
  accessCode: string;
}

export class LiveKitConferenceGateway extends ObservableConference {
  private readonly room = new Room({
    adaptiveStream: true,
    dynacast: true,
    disconnectOnPageLeave: true,
  });

  private screenPublications: LocalTrackPublication[] = [];
  private microphonePublication?: LocalTrackPublication;
  private processedMicrophone?: ProcessedMicrophoneTrack;
  private readonly microphoneTrackFactory = new MicrophoneTrackFactory();

  public constructor(private readonly configuration: LiveKitGatewayConfiguration) {
    super();
    this.registerRoomEvents();
  }

  public async join(command: JoinRoomCommand): Promise<void> {
    this.update({ connectionState: 'connecting', error: undefined });

    try {
      const credentials = await this.requestToken(command);
      await this.room.connect(credentials.serverUrl, credentials.token);
      this.refreshParticipants();
      this.update({ connectionState: 'connected' });
    } catch (error) {
      this.update({
        connectionState: 'disconnected',
        error: error instanceof Error ? error.message : 'The room could not be joined.',
      });
      throw error;
    }
  }

  public async leave(): Promise<void> {
    await this.stopScreenShare();
    await this.disableMicrophone();
    await this.room.disconnect();
    this.update({ connectionState: 'disconnected', participants: [] });
  }

  public async setMicrophoneEnabled(enabled: boolean, options: MicrophoneOptions): Promise<void> {
    if (!enabled) {
      await this.disableMicrophone();
    } else {
      await this.disableMicrophone();
      this.processedMicrophone = await this.microphoneTrackFactory.create(options);
      this.microphonePublication = await this.room.localParticipant.publishTrack(
        new LocalAudioTrack(this.processedMicrophone.track),
        {
          source: Track.Source.Microphone,
          audioPreset: { maxBitrate: 64_000 },
          dtx: true,
          red: true,
        },
      );
    }
    this.update({ microphoneEnabled: enabled });
    this.refreshParticipants();
  }

  private async disableMicrophone(): Promise<void> {
    const publication = this.microphonePublication;
    this.microphonePublication = undefined;
    if (publication?.track) {
      await this.room.localParticipant.unpublishTrack(publication.track, true);
    }
    await this.processedMicrophone?.dispose();
    this.processedMicrophone = undefined;
  }

  public async setDeafened(deafened: boolean): Promise<void> {
    this.room.remoteParticipants.forEach((participant) => {
      participant.audioTrackPublications.forEach((publication) => {
        if (deafened) publication.setSubscribed(false);
        else publication.setSubscribed(true);
      });
    });
    this.update({ deafened });
  }

  public async startScreenShare(options: ScreenShareOptions): Promise<void> {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia(
        createDisplayMediaOptions(options),
      );

      const videoTrack = stream.getVideoTracks()[0];
      const audioTrack = stream.getAudioTracks()[0];
      if (!videoTrack) throw new Error('The selected monitor did not provide a video track.');
      const platform = await window.desktop?.app.getPlatform();
      if (platform === 'win32' && !audioTrack) {
        stream.getTracks().forEach((track) => track.stop());
        throw new Error('Windows system audio was not captured. Select a full monitor and try again.');
      }

      videoTrack.addEventListener('ended', () => void this.stopScreenShare());

      const videoPublication = await this.room.localParticipant.publishTrack(
        new LocalVideoTrack(videoTrack),
        {
          source: Track.Source.ScreenShare,
          screenShareEncoding: {
            maxBitrate: options.maxBitrate,
            maxFramerate: options.frameRate,
          },
          simulcast: true,
        },
      );
      this.screenPublications.push(videoPublication);

      if (audioTrack) {
        const audioPublication = await this.room.localParticipant.publishTrack(
          new LocalAudioTrack(audioTrack),
          {
            source: Track.Source.ScreenShareAudio,
            audioPreset: { maxBitrate: 128_000 },
            forceStereo: true,
            dtx: false,
          },
        );
        this.screenPublications.push(audioPublication);
      }

      this.update({ screenSharing: true, error: undefined });
      this.refreshParticipants();
    } catch (error) {
      this.update({ error: error instanceof Error ? error.message : 'Screen sharing could not start.' });
      throw error;
    }
  }

  public async stopScreenShare(): Promise<void> {
    const publications = [...this.screenPublications];
    this.screenPublications = [];
    await Promise.all(
      publications.map(async (publication) => {
        const track = publication.track;
        if (track) await this.room.localParticipant.unpublishTrack(track, true);
      }),
    );
    this.update({ screenSharing: false });
    this.refreshParticipants();
  }

  public setParticipantVolume(participantId: string, volume: number): void {
    const participant = this.room.remoteParticipants.get(participantId);
    participant?.setVolume(volume / 100, Track.Source.Microphone);
    participant?.setVolume(volume / 100, Track.Source.ScreenShareAudio);
    this.refreshParticipants();
  }

  private async requestToken(command: JoinRoomCommand): Promise<TokenResponse> {
    const response = await fetch(`${this.configuration.apiUrl}/api/rooms/${encodeURIComponent(command.roomId)}/token`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${this.configuration.accessCode}`,
      },
      body: JSON.stringify({ participantName: command.participantName }),
    });

    if (!response.ok) {
      throw new Error(response.status === 401 ? 'The room access code is not valid.' : 'The call server is unavailable.');
    }

    return response.json() as Promise<TokenResponse>;
  }

  private registerRoomEvents(): void {
    this.room
      .on(RoomEvent.ParticipantConnected, () => this.refreshParticipants())
      .on(RoomEvent.ParticipantDisconnected, () => this.refreshParticipants())
      .on(RoomEvent.ActiveSpeakersChanged, () => this.refreshParticipants())
      .on(
        RoomEvent.TrackSubscribed,
        (_track: RemoteTrack, _publication: RemoteTrackPublication, _participant: RemoteParticipant) =>
          this.refreshParticipants(),
      )
      .on(RoomEvent.TrackUnsubscribed, () => this.refreshParticipants())
      .on(RoomEvent.Reconnecting, () => this.update({ connectionState: 'reconnecting' }))
      .on(RoomEvent.Reconnected, () => this.update({ connectionState: 'connected' }))
      .on(RoomEvent.Disconnected, () => this.update({ connectionState: 'disconnected' }));
  }

  private refreshParticipants(): void {
    const local: Participant = {
      id: this.room.localParticipant.identity || 'local',
      name: this.room.localParticipant.name || 'You',
      initials: this.getInitials(this.room.localParticipant.name || 'You'),
      accent: '#a8bdff',
      isLocal: true,
      isMuted: !this.room.localParticipant.isMicrophoneEnabled,
      isSpeaking: this.room.localParticipant.isSpeaking,
      volume: 100,
      screenStream: this.createLocalScreenStream(),
    };

    const remote = [...this.room.remoteParticipants.values()].map((participant, index) =>
      this.mapRemoteParticipant(participant, index),
    );
    this.update({ participants: [local, ...remote] });
  }

  private mapRemoteParticipant(participant: RemoteParticipant, index: number): Participant {
    const microphoneStream = new MediaStream();
    const screenStream = new MediaStream();
    participant.trackPublications.forEach((publication) => {
      const mediaTrack = publication.track?.mediaStreamTrack;
      if (!mediaTrack) return;
      if (publication.source === Track.Source.ScreenShare || publication.source === Track.Source.ScreenShareAudio) {
        screenStream.addTrack(mediaTrack);
      } else if (publication.source === Track.Source.Microphone) {
        microphoneStream.addTrack(mediaTrack);
      }
    });

    const accents = ['#ee8d72', '#7c98ed', '#7bc6aa', '#d0a3ea'];
    return {
      id: participant.identity,
      name: participant.name || participant.identity,
      initials: this.getInitials(participant.name || participant.identity),
      accent: accents[index % accents.length],
      isLocal: false,
      isMuted: !participant.isMicrophoneEnabled,
      isSpeaking: participant.isSpeaking,
      volume: Math.round((participant.getVolume(Track.Source.Microphone) ?? 1) * 100),
      microphoneStream: microphoneStream.getTracks().length ? microphoneStream : undefined,
      screenStream: screenStream.getTracks().length ? screenStream : undefined,
    };
  }

  private createLocalScreenStream(): MediaStream | undefined {
    const stream = new MediaStream();
    this.screenPublications.forEach((publication) => {
      const mediaTrack = publication.track?.mediaStreamTrack;
      if (mediaTrack) stream.addTrack(mediaTrack);
    });
    return stream.getTracks().length ? stream : undefined;
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
