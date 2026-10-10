import {
  LocalAudioTrack,
  LocalVideoTrack,
  Room,
  RoomEvent,
  Track,
  type LocalTrackPublication,
  type Participant as LiveKitParticipant,
  type RemoteParticipant,
  type RemoteTrack,
  type RemoteTrackPublication,
} from 'livekit-client';
import type {
  ConnectionReport,
  ConnectionSample,
  JoinRoomCommand,
  MicrophoneOptions,
  Participant,
  ParticipantHealth,
  ScreenShareOptions,
  SignalQuality,
  VoiceDelayName,
} from '../../domain/conference';
import { voiceDelayPresets } from '../../domain/conference';
import { ObservableConference } from './observable-conference';
import { createDisplayMediaOptions } from '../media/display-media-options';
import { ParticipantStreamRegistry } from '../media/participant-stream-registry';
import { MicrophoneTrackFactory, type ProcessedMicrophoneTrack } from '../media/microphone-track-factory';
import { updateScreenShareTrack } from '../media/screen-share-quality';
import { reuseParticipants } from './snapshot-diff';
import { accountOf, ListeningLevels } from '../persistence/listening-levels';

const grades: SignalQuality[] = ['excellent', 'good', 'poor', 'lost', 'unknown'];

// LiveKit names the grades the room wants to draw, but it is free to add to
// them, so anything unrecognised is simply not spoken about.
function signalOf(quality: string | undefined): SignalQuality | undefined {
  const grade = grades.find((known) => known === quality);
  return grade === 'unknown' ? undefined : grade;
}

interface TokenResponse {
  serverUrl: string;
  token: string;
}

/** A token fetched ahead of a click, good for a short while. */
interface PreparedToken {
  roomId: string;
  participantName: string;
  at: number;
  response: Promise<TokenResponse>;
}

// Tokens are issued for sixty seconds; one older than this is not worth the risk.
const preparedTokenMs = 40_000;
const connectionSampleMs = 3_000;
const connectionSamplesKept = 100;

type Stat = Record<string, unknown>;

/** The reading of the line the call is actually using, out of a stats report. */
export function readLine(report: RTCStatsReport | undefined) {
  if (!report) return undefined;
  const stats = [...report.values()] as Stat[];
  const transport = stats.find((entry) => entry.type === 'transport' && entry.selectedCandidatePairId);
  const pair =
    stats.find(
      (entry) => entry.type === 'candidate-pair' && entry.id === transport?.selectedCandidatePairId,
    ) ??
    stats.find((entry) => entry.type === 'candidate-pair' && entry.nominated && entry.state === 'succeeded');
  if (!pair) return undefined;
  const local = stats.find((entry) => entry.id === pair.localCandidateId);
  const sent = stats
    .filter((entry) => entry.type === 'outbound-rtp' && entry.kind === 'audio')
    .reduce((sum, entry) => sum + Number(entry.packetsSent ?? 0), 0);
  const lost = stats
    .filter((entry) => entry.type === 'remote-inbound-rtp' && entry.kind === 'audio')
    .reduce((sum, entry) => sum + Math.max(0, Number(entry.packetsLost ?? 0)), 0);
  const transportKind: NonNullable<ConnectionReport['transport']> =
    local?.candidateType === 'relay' ? 'relay' : local?.protocol === 'tcp' ? 'tcp' : 'udp';
  return {
    pingMs: typeof pair.currentRoundTripTime === 'number' ? pair.currentRoundTripTime * 1000 : undefined,
    transport: transportKind,
    sent,
    lost,
  };
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
  private screenQualityUpdate: Promise<void> = Promise.resolve();
  private microphonePublication?: LocalTrackPublication;
  private processedMicrophone?: ProcessedMicrophoneTrack;
  private readonly microphoneTrackFactory = new MicrophoneTrackFactory();
  private readonly streams = new ParticipantStreamRegistry();
  // A microphone opened while the call is still being set up, so that opening
  // it does not wait for the network and the network does not wait for it.
  private pendingMicrophone?: { options: MicrophoneOptions; track: Promise<ProcessedMicrophoneTrack> };
  private preparedToken?: PreparedToken;
  private connectionSamples: ConnectionSample[] = [];
  private connectionCounters: { sent: number; lost: number }[] = [];
  private connectionTransport?: ConnectionReport['transport'];
  private connectionTimer?: ReturnType<typeof setInterval>;
  // Decoding a screen is the most expensive thing this client does, so it is
  // asked for by name: the one being watched, and the one under the pointer.
  private readonly watched = new Set<string>();
  private previewed?: string;
  private deafened = false;
  // What the microphone graph last said about whether this person is talking.
  private localSpeaking = false;
  // Keep the event payload as the source of truth. Some LiveKit builds update
  // participant.isSpeaking after observers have already taken their snapshot.
  private readonly activeSpeakers = new Set<string>();
  // How much of a voice this machine is willing to hold back before playing it.
  private voiceDelay: VoiceDelayName = 'lowest';
  private microphoneOptions?: MicrophoneOptions;
  private generation = 0;
  private joinAbort?: AbortController;

  public constructor(
    private readonly configuration: LiveKitGatewayConfiguration,
    // LiveKit reports the volume of the elements it attached itself, and this
    // client renders its own, so playback levels are kept here, by account.
    private readonly levels = new ListeningLevels(),
  ) {
    super();
    this.registerRoomEvents();
  }

  /**
   * Gets a call ready before it is asked for: the token, and the connection to
   * the voice server warmed up. A pointer resting on a channel is a fair sign
   * of what comes next, and the token request is the slowest step of joining.
   */
  public prepare(command: JoinRoomCommand): void {
    if (this.isFresh(this.preparedToken, command)) return;
    const response = this.requestToken(command);
    // Nobody is waiting on a guess, so a failed one is simply forgotten.
    response.catch(() => {
      if (this.preparedToken?.response === response) this.preparedToken = undefined;
    });
    response
      .then((credentials) => this.room.prepareConnection(credentials.serverUrl, credentials.token))
      .catch(() => undefined);
    this.preparedToken = { ...command, at: Date.now(), response };
  }

  private isFresh(prepared: PreparedToken | undefined, command: JoinRoomCommand): prepared is PreparedToken {
    return (
      prepared !== undefined &&
      prepared.roomId === command.roomId &&
      prepared.participantName === command.participantName &&
      Date.now() - prepared.at < preparedTokenMs
    );
  }

  /** Opens the microphone now, for the call about to start, and keeps it for it. */
  public prepareMicrophone(options: MicrophoneOptions): void {
    void this.discardPendingMicrophone();
    const track = this.microphoneTrackFactory.create(options, this.onLocalSpeaking);
    // A capture that fails here is tried again, and reported, when it is used.
    track.catch(() => undefined);
    this.pendingMicrophone = { options, track };
  }

  private async discardPendingMicrophone(): Promise<void> {
    const pending = this.pendingMicrophone;
    this.pendingMicrophone = undefined;
    await pending?.track.then((track) => track.dispose()).catch(() => undefined);
  }

  private takeToken(command: JoinRoomCommand, signal: AbortSignal): Promise<TokenResponse> {
    const prepared = this.preparedToken;
    this.preparedToken = undefined;
    if (this.isFresh(prepared, command))
      return prepared.response.catch(() => this.requestToken(command, signal));
    return this.requestToken(command, signal);
  }

  public async join(command: JoinRoomCommand): Promise<void> {
    const generation = ++this.generation;
    this.joinAbort?.abort();
    this.joinAbort = new AbortController();
    this.activeSpeakers.clear();
    this.update({ connectionState: 'connecting', error: undefined });

    try {
      const credentials = await this.takeToken(command, this.joinAbort.signal);
      if (generation !== this.generation) throw new Error('Call was cancelled.');
      await this.room.connect(credentials.serverUrl, credentials.token);
      if (generation !== this.generation) {
        await this.room.disconnect();
        throw new Error('Call was cancelled.');
      }
      this.refreshParticipants();
      this.update({ connectionState: 'connected' });
      this.startConnectionSampling();
    } catch (error) {
      await this.discardPendingMicrophone();
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
    this.activeSpeakers.clear();
    this.stopConnectionSampling();
    await this.discardPendingMicrophone();
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
      await this.discardPendingMicrophone();
      this.update({ microphoneEnabled: false });
      this.refreshParticipants();
      return;
    }

    if (!enabled) {
      await this.discardPendingMicrophone();
      this.update({ microphoneEnabled: false });
      this.refreshParticipants();
      return;
    }

    try {
      const processed = await this.captureMicrophone(options);
      if (generation !== this.generation) {
        await processed.dispose();
        return;
      }
      this.processedMicrophone = processed;
      const publication = await this.room.localParticipant.publishTrack(
        new LocalAudioTrack(this.processedMicrophone.track),
        {
          source: Track.Source.Microphone,
          // Mono speech through a high pass and a gate is transparent well
          // below this; the rest was bitrate to encode, send and decode that
          // nobody in the room could hear. Redundancy is kept, because it
          // costs packets rather than delay and this is a home connection.
          audioPreset: { maxBitrate: 32_000 },
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

  /**
   * The microphone opened while joining, when it was opened the same way;
   * otherwise a fresh one. Gain and gate set since then are applied to it,
   * since they live in the running graph.
   */
  private async captureMicrophone(options: MicrophoneOptions): Promise<ProcessedMicrophoneTrack> {
    const pending = this.pendingMicrophone;
    this.pendingMicrophone = undefined;
    if (pending && this.sameCapture(pending.options, options)) {
      const early = await pending.track.catch(() => undefined);
      if (early) {
        early.apply(options);
        return early;
      }
    } else if (pending) {
      void pending.track.then((track) => track.dispose()).catch(() => undefined);
    }
    return this.microphoneTrackFactory.create(options, this.onLocalSpeaking);
  }

  private needsRecapture(options: MicrophoneOptions): boolean {
    const current = this.microphoneOptions;
    if (!current || !this.microphonePublication) return true;
    return !this.sameCapture(current, options);
  }

  /** Whether two sets of options open the same device through the same graph. */
  private sameCapture(current: MicrophoneOptions, options: MicrophoneOptions): boolean {
    return (
      current.deviceId === options.deviceId &&
      current.echoCancellation === options.echoCancellation &&
      current.noiseSuppression === options.noiseSuppression &&
      current.autoGainControl === options.autoGainControl &&
      current.voiceIsolation === options.voiceIsolation &&
      current.latencyHint === options.latencyHint
    );
  }

  private readonly onLocalSpeaking = (speaking: boolean): void => {
    if (this.localSpeaking === speaking) return;
    this.localSpeaking = speaking;
    this.refreshParticipants();
  };

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

  public watchScreen(participantId: string, watching: boolean): void {
    if (watching) this.watched.add(participantId);
    else this.watched.delete(participantId);
    this.applyScreenSubscriptions();
    this.update({ watching: [...this.watched] });
    this.refreshParticipants();
  }

  public previewScreen(participantId?: string): void {
    this.previewed = participantId;
    this.applyScreenSubscriptions();
    this.refreshParticipants();
  }

  /**
   * A screen arrives only for the person who asked for it. Everybody else's is
   * left on the server, which is the whole point: a machine that is not looking
   * does not decode, and a stream nobody opened is silent.
   *
   * A glance borrows the picture alone. A preview that started playing sound
   * would mean passing the pointer over a name fills the room with somebody's
   * game.
   */
  private applyScreenSubscriptions(): void {
    this.room.remoteParticipants.forEach((participant) => {
      const watching = this.watched.has(participant.identity);
      const glancing = participant.identity === this.previewed;
      participant.trackPublications.forEach((publication) => {
        const remote = publication as RemoteTrackPublication;
        if (publication.source === Track.Source.ScreenShare) {
          const wanted = watching || glancing;
          if (remote.isDesired !== wanted) remote.setSubscribed(wanted);
        } else if (publication.source === Track.Source.ScreenShareAudio) {
          const wanted = watching && !this.deafened;
          if (remote.isDesired !== wanted) remote.setSubscribed(wanted);
        }
      });
    });
  }

  /** Nobody is watching a screen that has gone, and nothing should wait for it. */
  private forgetVanishedScreens(): void {
    const broadcasting = (identity?: string) =>
      Boolean(identity) &&
      [...this.room.remoteParticipants.values()].some(
        (participant) =>
          participant.identity === identity &&
          [...participant.trackPublications.values()].some(
            (publication) => publication.source === Track.Source.ScreenShare,
          ),
      );
    if (this.previewed && !broadcasting(this.previewed)) this.previewed = undefined;
    const gone = [...this.watched].filter((identity) => !broadcasting(identity));
    if (gone.length > 0) {
      gone.forEach((identity) => this.watched.delete(identity));
      this.update({ watching: [...this.watched] });
    }
  }

  public async setDeafened(deafened: boolean): Promise<void> {
    this.deafened = deafened;
    this.room.remoteParticipants.forEach((participant) => {
      participant.audioTrackPublications.forEach((publication) => {
        // The sound of a screen follows whether it is being watched, so it is
        // left to the rule that owns it rather than turned back on here.
        if (publication.source === Track.Source.ScreenShareAudio) return;
        publication.setSubscribed(!deafened);
      });
    });
    this.applyScreenSubscriptions();
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

  /**
   * Changes capture constraints and sender limits in place. The MediaStreamTrack
   * and LiveKit publication keep their identity, so viewers do not see the live
   * disappear and system audio is never interrupted.
   */
  public updateScreenShare(options: ScreenShareOptions): Promise<void> {
    const update = this.screenQualityUpdate.then(async () => {
      const publication = this.screenPublications.find(
        (candidate) => candidate.source === Track.Source.ScreenShare,
      );
      const track = publication?.track;
      if (!(track instanceof LocalVideoTrack)) return;

      await updateScreenShareTrack(track.mediaStreamTrack, track.sender, options);
    });
    // A rapid second selection waits for the browser's first setParameters;
    // WebRTC rejects overlapping parameter changes.
    this.screenQualityUpdate = update.catch(() => undefined);
    return update;
  }

  public setParticipantVolume(participantId: string, volume: number): void {
    this.levels.set(accountOf(participantId), { volume });
    this.refreshParticipants();
  }

  public setParticipantMuted(participantId: string, muted: boolean): void {
    this.levels.set(accountOf(participantId), { muted });
    this.refreshParticipants();
  }

  public async readConnection(): Promise<ConnectionReport> {
    return summariseConnection(this.connectionSamples, this.connectionCounters, this.connectionTransport);
  }

  private startConnectionSampling(): void {
    this.stopConnectionSampling();
    this.connectionSamples = [];
    this.connectionCounters = [];
    this.connectionTransport = undefined;
    void this.sampleConnection();
    this.connectionTimer = setInterval(() => void this.sampleConnection(), connectionSampleMs);
  }

  private stopConnectionSampling(): void {
    if (this.connectionTimer) clearInterval(this.connectionTimer);
    this.connectionTimer = undefined;
  }

  /**
   * One reading of the line. The round trip comes from the path the media is
   * actually taking, which is what a voice feels; the signalling socket's own
   * ping is the fallback when no media path is up yet.
   */
  private async sampleConnection(): Promise<void> {
    const transports = this.room.engine.pcManager;
    const publisher = readLine(await transports?.publisher.getStats()?.catch(() => undefined));
    const subscriber = readLine(await transports?.subscriber?.getStats()?.catch(() => undefined));
    const line = publisher?.pingMs !== undefined ? publisher : (subscriber ?? publisher);
    const signalPing = this.room.engine.client.rtt;
    const pingMs = line?.pingMs ?? (signalPing > 0 ? signalPing : undefined);
    if (pingMs !== undefined) {
      this.connectionSamples.push({ at: Date.now(), pingMs });
      if (this.connectionSamples.length > connectionSamplesKept) this.connectionSamples.shift();
    }
    if (publisher) {
      this.connectionCounters.push({ sent: publisher.sent, lost: publisher.lost });
      if (this.connectionCounters.length > connectionSamplesKept) this.connectionCounters.shift();
    }
    if (line) this.connectionTransport = line.transport;
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
      .on(RoomEvent.ParticipantConnected, () => {
        this.applyScreenSubscriptions();
        this.refreshParticipants();
      })
      .on(RoomEvent.ParticipantDisconnected, (participant: RemoteParticipant) => {
        this.activeSpeakers.delete(participant.identity);
        this.streams.forget(participant.identity);
        this.forgetVanishedScreens();
        this.refreshParticipants();
      })
      .on(RoomEvent.ActiveSpeakersChanged, (speakers: LiveKitParticipant[]) => {
        this.activeSpeakers.clear();
        speakers.forEach((participant) => this.activeSpeakers.add(participant.identity));
        this.refreshParticipants();
      })
      .on(RoomEvent.ConnectionQualityChanged, () => this.refreshParticipants())
      .on(RoomEvent.TrackPublished, () => {
        this.applyScreenSubscriptions();
        this.refreshParticipants();
      })
      .on(RoomEvent.TrackUnpublished, () => {
        this.forgetVanishedScreens();
        this.refreshParticipants();
      })
      .on(
        RoomEvent.TrackSubscribed,
        (track: RemoteTrack, _publication: RemoteTrackPublication, _participant: RemoteParticipant) => {
          this.applyVoiceDelay(track);
          this.refreshParticipants();
        },
      )
      .on(RoomEvent.TrackUnsubscribed, () => this.refreshParticipants())
      .on(RoomEvent.Reconnecting, () => this.update({ connectionState: 'reconnecting' }))
      .on(RoomEvent.Reconnected, () => this.update({ connectionState: 'connected' }))
      .on(RoomEvent.Disconnected, () => {
        this.stopConnectionSampling();
        this.localSpeaking = false;
        this.activeSpeakers.clear();
        this.watched.clear();
        this.previewed = undefined;
        this.update({ watching: [] });
        this.streams.clear();
        this.update({ connectionState: 'disconnected', participants: [] });
      });
  }

  /**
   * Asks the receiver to hold a voice for as little as the line allows.
   *
   * Only voices: a shared screen is watched rather than talked to, and the
   * smoothness of its sound is worth more than a tenth of a second of it.
   */
  public setVoiceDelay(delay: VoiceDelayName): void {
    this.voiceDelay = delay;
    this.room.remoteParticipants.forEach((participant) => {
      participant.trackPublications.forEach((publication) => {
        if (publication.track) this.applyVoiceDelay(publication.track);
      });
    });
  }

  /**
   * Asks the receiver what it has had to invent lately.
   *
   * Concealment is the number that matters: samples played to cover packets
   * that were late or never came. It is the difference between a microphone
   * that sounds wrong and a line that is not delivering, which are two
   * completely different things to go and fix.
   */
  public async readHealth(): Promise<ParticipantHealth[]> {
    const people = [...this.room.remoteParticipants.values()];
    const readings = await Promise.all(
      people.map(async (participant) => {
        const voice = [...participant.trackPublications.values()].find(
          (publication) => publication.source === Track.Source.Microphone,
        )?.track;
        const health: ParticipantHealth = {
          id: participant.identity,
          name: participant.name || participant.identity,
        };
        const report = await voice?.getRTCStatsReport?.().catch(() => undefined);
        report?.forEach((entry) => {
          const stat = entry as Record<string, number | string>;
          if (stat.type !== 'inbound-rtp' || stat.kind !== 'audio') return;
          const played = Number(stat.totalSamplesReceived ?? 0);
          const concealed = Number(stat.concealedSamples ?? 0);
          if (played > 0) health.concealedPercent = (concealed / played) * 100;
          health.packetsLost = Number(stat.packetsLost ?? 0);
          health.jitterMs = Number(stat.jitter ?? 0) * 1000;
          const emitted = Number(stat.jitterBufferEmittedCount ?? 0);
          if (emitted > 0) {
            health.jitterBufferMs = (Number(stat.jitterBufferDelay ?? 0) / emitted) * 1000;
          }
        });
        return health;
      }),
    );
    return readings;
  }

  private applyVoiceDelay(track: RemoteTrack): void {
    if (track.source !== Track.Source.Microphone) return;
    const seconds = voiceDelayPresets[this.voiceDelay].seconds;
    // Undefined means the receiver keeps its own judgement, which is the right
    // answer whenever the line is the thing that cannot be relied on.
    if (seconds === undefined) return;
    // Older runtimes have no say over the buffer, and a call is worth more
    // than the setting.
    track.setPlayoutDelay?.(seconds);
  }

  private refreshParticipants(): void {
    const local: Participant = {
      id: this.localIdentity(),
      name: this.room.localParticipant.name || 'You',
      initials: this.getInitials(this.room.localParticipant.name || 'You'),
      accent: '#C6B4E3',
      isLocal: true,
      isMuted: !this.microphonePublication,
      // The room learns who is talking from the server, on an interval and a
      // round trip away. Your own microphone is on this machine, so your own
      // face does not wait to hear about you from Frankfurt.
      isSpeaking: this.microphonePublication ? this.localSpeaking : false,
      volume: 100,
      locallyMuted: false,
      screenStream: this.createLocalScreenStream(),
      isBroadcasting: this.screenPublications.length > 0,
      signal: signalOf(this.room.localParticipant.connectionQuality),
    };

    const remote = [...this.room.remoteParticipants.values()].map((participant, index) =>
      this.mapRemoteParticipant(participant, index),
    );
    // Whoever did not change keeps the object they had, so a list can skip
    // them and the snapshot can tell that nothing happened at all.
    this.update({ participants: reuseParticipants(this.snapshot.participants, [local, ...remote]) });
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

    const accents = ['#F0AAA8', '#A8D7B9', '#E5C987', '#C6B4E3', '#A8CDD0'];
    const broadcasting = [...participant.trackPublications.values()].some(
      (publication) => publication.source === Track.Source.ScreenShare,
    );
    return {
      id: participant.identity,
      isBroadcasting: broadcasting,
      name: participant.name || participant.identity,
      initials: this.getInitials(participant.name || participant.identity),
      accent: accents[index % accents.length],
      isLocal: false,
      isMuted: !participant.isMicrophoneEnabled,
      isSpeaking: this.activeSpeakers.has(participant.identity) || participant.isSpeaking,
      volume: this.levels.get(accountOf(participant.identity)).volume,
      locallyMuted: this.levels.get(accountOf(participant.identity)).muted,
      microphoneStream: this.streams.sync(participant.identity, 'microphone', microphoneTracks),
      screenStream: this.streams.sync(participant.identity, 'screen', screenTracks),
      signal: signalOf(participant.connectionQuality),
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

/**
 * The readings, as somebody would want them said: the latest round trip, the
 * average over the window, and the share of sent packets that were lost in
 * that same window rather than since the call began, so an old bad minute
 * does not hang over a line that has recovered.
 */
export function summariseConnection(
  samples: readonly ConnectionSample[],
  counters: readonly { sent: number; lost: number }[],
  transport?: ConnectionReport['transport'],
): ConnectionReport {
  const first = counters[0];
  const last = counters.at(-1);
  const sent = first && last ? last.sent - first.sent : 0;
  const lost = first && last ? Math.max(0, last.lost - first.lost) : 0;
  return {
    samples: [...samples],
    lastPingMs: samples.at(-1)?.pingMs,
    averagePingMs: samples.length
      ? samples.reduce((sum, sample) => sum + sample.pingMs, 0) / samples.length
      : undefined,
    sentLossPercent: sent > 0 ? (lost / (sent + lost)) * 100 : last ? 0 : undefined,
    transport,
  };
}
