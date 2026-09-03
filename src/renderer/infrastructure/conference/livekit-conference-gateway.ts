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
import { ParticipantStreamRegistry } from '../media/participant-stream-registry';
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
  // Adaptive stream pauses tracks it believes are off screen, and it can only
  // see elements attached through the LiveKit API. This client renders media
  // itself, so the feature would pause a screen share that is plainly visible.
  private readonly room = new Room({
    adaptiveStream: false,
    dynacast: true,
    disconnectOnPageLeave: true,
  });

  private screenPublications: LocalTrackPublication[] = [];
  private microphonePublication?: LocalTrackPublication;
  private processedMicrophone?: ProcessedMicrophoneTrack;
  private readonly microphoneTrackFactory = new MicrophoneTrackFactory();
  private readonly streams = new ParticipantStreamRegistry();
  // LiveKit reports the volume of the elements it attached itself, and this
  // client renders its own, so playback levels are kept here.
  private readonly volumes = new Map<string, number>();
  private readonly locallyMuted = new Set<string>();
  private microphoneOptions?: MicrophoneOptions;
  private generation = 0;
  private joinAbort?: AbortController;

  public constructor(private readonly configuration: LiveKitGatewayConfiguration) {
    super();
    this.registerRoomEvents();
  }

  public async join(command: JoinRoomCommand): Promise<void> {
    const generation = ++this.generation;
    this.joinAbort?.abort();
    this.joinAbort = new AbortController();
    this.update({ connectionState: 'connecting', error: undefined });

    try {
      const credentials = await this.requestToken(command, this.joinAbort.signal);
      if (generation !== this.generation) throw new Error('Call was cancelled.');
      await this.room.connect(credentials.serverUrl, credentials.token);
      if (generation !== this.generation) {
        await this.room.disconnect();
        throw new Error('Call was cancelled.');
      }
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
    this.generation++;
    this.joinAbort?.abort();
    await this.stopScreenShare();
    await this.disableMicrophone();
    await this.room.disconnect();
    this.streams.clear();
    this.update({ connectionState: 'disconnected', participants: [] });
  }

  public async setMicrophoneEnabled(enabled: boolean, options: MicrophoneOptions): Promise<void> {
    const generation = this.generation;
    await this.disableMicrophone();

    const permissions = this.room.localParticipant.permissions;
    if (
      enabled &&
      permissions &&
      (!permissions.canPublish ||
        (permissions.canPublishSources.length > 0 &&
          !permissions.canPublishSources.includes(Track.sourceToProto(Track.Source.Microphone))))
    ) {
      this.update({ microphoneEnabled: false });
      this.refreshParticipants();
      return;
    }

    if (!enabled) {
      this.update({ microphoneEnabled: false });
      this.refreshParticipants();
      return;
    }

    try {
      const processed = await this.microphoneTrackFactory.create(options);
      if (generation !== this.generation) {
        await processed.dispose();
        return;
      }
      this.processedMicrophone = processed;
      const publication = await this.room.localParticipant.publishTrack(
        new LocalAudioTrack(this.processedMicrophone.track),
        {
          source: Track.Source.Microphone,
          audioPreset: { maxBitrate: 64_000 },
          dtx: true,
          red: true,
        },
      );
      if (publication.isMuted) await publication.unmute();
      this.microphonePublication = publication;
      this.microphoneOptions = options;
      this.update({ microphoneEnabled: true, error: undefined });
    } catch (error) {
      // Reporting an open microphone that never published would leave the
      // speaker believing the room can hear them.
      await this.disableMicrophone();
      this.update({
        microphoneEnabled: false,
        error: error instanceof Error ? error.message : 'The microphone could not be opened.',
      });
      this.refreshParticipants();
      throw error;
    }

    this.refreshParticipants();
  }

  /**
   * Gain and the noise gate live in the running graph, so changing them must
   * not republish the track: the room would lose the speaker for a moment and
   * listeners would be left with a stream whose track had been swapped.
   */
  public async applyMicrophoneOptions(options: MicrophoneOptions): Promise<void> {
    if (this.needsRecapture(options)) {
      await this.setMicrophoneEnabled(this.snapshot.microphoneEnabled, options);
      return;
    }

    this.microphoneOptions = options;
    this.processedMicrophone?.apply(options);
  }

  private needsRecapture(options: MicrophoneOptions): boolean {
    const current = this.microphoneOptions;
    if (!current || !this.microphonePublication) return true;
    return (
      current.deviceId !== options.deviceId ||
      current.echoCancellation !== options.echoCancellation ||
      current.noiseSuppression !== options.noiseSuppression ||
      current.autoGainControl !== options.autoGainControl
    );
  }

  private async disableMicrophone(): Promise<void> {
    const publication = this.microphonePublication;
    this.microphonePublication = undefined;
    if (publication?.track) {
      await this.room.localParticipant.unpublishTrack(publication.track, true);
    }
    await this.processedMicrophone?.dispose();
    this.processedMicrophone = undefined;
    this.microphoneOptions = undefined;
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
    const generation = this.generation;
    let stream: MediaStream | undefined;
    try {
      stream = await navigator.mediaDevices.getDisplayMedia(createDisplayMediaOptions(options));
      if (generation !== this.generation) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }

      const videoTrack = stream.getVideoTracks()[0];
      const audioTrack = stream.getAudioTracks()[0];
      if (!videoTrack) throw new Error('The selected monitor did not provide a video track.');
      const platform = await window.desktop?.app.getPlatform();
      if (platform === 'win32' && !audioTrack) {
        stream.getTracks().forEach((track) => track.stop());
        throw new Error('Windows system audio was not captured. Select a full monitor and try again.');
      }

      videoTrack.addEventListener('ended', () => void this.stopScreenShare());
      videoTrack.contentHint = options.contentHint;

      const videoPublication = await this.room.localParticipant.publishTrack(
        new LocalVideoTrack(videoTrack),
        {
          source: Track.Source.ScreenShare,
          screenShareEncoding: {
            maxBitrate: options.maxBitrate,
            maxFramerate: options.frameRate,
          },
          // A monitor share has one meaningful resolution. Simulcast would make
          // the sender hop between quality layers, which viewers see as flicker.
          simulcast: false,
          degradationPreference: 'maintain-resolution',
        },
      );
      this.screenPublications.push(videoPublication);
      if (generation !== this.generation) {
        await this.stopScreenShare();
        stream.getTracks().forEach((track) => track.stop());
        return;
      }

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
      if (generation !== this.generation) {
        await this.stopScreenShare();
        stream.getTracks().forEach((track) => track.stop());
        return;
      }

      this.update({ screenSharing: true, error: undefined });
      this.refreshParticipants();
    } catch (error) {
      stream?.getTracks().forEach((track) => track.stop());
      await this.stopScreenShare().catch(() => {});
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
    this.volumes.set(participantId, Math.min(200, Math.max(0, volume)));
    this.refreshParticipants();
  }

  public setParticipantMuted(participantId: string, muted: boolean): void {
    if (muted) this.locallyMuted.add(participantId);
    else this.locallyMuted.delete(participantId);
    this.refreshParticipants();
  }

  private async requestToken(command: JoinRoomCommand, signal?: AbortSignal): Promise<TokenResponse> {
    const response = await fetch(
      `${this.configuration.apiUrl}/api/rooms/${encodeURIComponent(command.roomId)}/token`,
      {
        method: 'POST',
        signal,
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${this.configuration.accessCode}`,
        },
        body: JSON.stringify({ participantName: command.participantName }),
      },
    );

    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      throw new Error(body.error ?? 'The call server is unavailable.');
    }

    return response.json() as Promise<TokenResponse>;
  }

  private registerRoomEvents(): void {
    this.room
      .on(RoomEvent.ParticipantConnected, () => this.refreshParticipants())
      .on(RoomEvent.ParticipantDisconnected, (participant: RemoteParticipant) => {
        this.streams.forget(participant.identity);
        this.volumes.delete(participant.identity);
        this.locallyMuted.delete(participant.identity);
        this.refreshParticipants();
      })
      .on(RoomEvent.ActiveSpeakersChanged, () => this.refreshParticipants())
      .on(
        RoomEvent.TrackSubscribed,
        (_track: RemoteTrack, _publication: RemoteTrackPublication, _participant: RemoteParticipant) =>
          this.refreshParticipants(),
      )
      .on(RoomEvent.TrackUnsubscribed, () => this.refreshParticipants())
      .on(RoomEvent.Reconnecting, () => this.update({ connectionState: 'reconnecting' }))
      .on(RoomEvent.Reconnected, () => this.update({ connectionState: 'connected' }))
      .on(RoomEvent.Disconnected, () => {
        this.streams.clear();
        this.update({ connectionState: 'disconnected', participants: [] });
      });
  }

  private refreshParticipants(): void {
    const local: Participant = {
      id: this.localIdentity(),
      name: this.room.localParticipant.name || 'You',
      initials: this.getInitials(this.room.localParticipant.name || 'You'),
      accent: '#a8bdff',
      isLocal: true,
      isMuted: !this.microphonePublication,
      isSpeaking: this.room.localParticipant.isSpeaking,
      volume: 100,
      locallyMuted: false,
      screenStream: this.createLocalScreenStream(),
    };

    const remote = [...this.room.remoteParticipants.values()].map((participant, index) =>
      this.mapRemoteParticipant(participant, index),
    );
    this.update({ participants: [local, ...remote] });
  }

  private mapRemoteParticipant(participant: RemoteParticipant, index: number): Participant {
    const microphoneTracks: MediaStreamTrack[] = [];
    const screenTracks: MediaStreamTrack[] = [];
    participant.trackPublications.forEach((publication) => {
      const mediaTrack = publication.track?.mediaStreamTrack;
      if (!mediaTrack) return;
      if (
        publication.source === Track.Source.ScreenShare ||
        publication.source === Track.Source.ScreenShareAudio
      ) {
        screenTracks.push(mediaTrack);
      } else if (publication.source === Track.Source.Microphone) {
        microphoneTracks.push(mediaTrack);
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
      volume: this.volumes.get(participant.identity) ?? 100,
      locallyMuted: this.locallyMuted.has(participant.identity),
      microphoneStream: this.streams.sync(participant.identity, 'microphone', microphoneTracks),
      screenStream: this.streams.sync(participant.identity, 'screen', screenTracks),
    };
  }

  private createLocalScreenStream(): MediaStream | undefined {
    const tracks = this.screenPublications
      .map((publication) => publication.track?.mediaStreamTrack)
      .filter((track): track is MediaStreamTrack => Boolean(track));
    return this.streams.sync(this.localIdentity(), 'screen', tracks);
  }

  private localIdentity(): string {
    return this.room.localParticipant.identity || 'local';
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
