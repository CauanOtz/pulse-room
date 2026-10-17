import type { ConferenceGateway } from './ports/conference-gateway';
import type { SettingsRepository, UserSettings } from './ports/settings-repository';
import { audioPlayback } from '../infrastructure/media/audio-playback-engine';
import { useOpusFrameSize } from '../infrastructure/media/opus-frame-size';
import {
  noiseGateThresholdDb,
  screenSharePresets,
  voiceDelayPresets,
  withinCeiling,
} from '../domain/conference';
import type { MicrophoneOptions, ScreenSharePresetName } from '../domain/conference';

export class ConferenceController {
  public constructor(
    public readonly gateway: ConferenceGateway,
    private readonly settingsRepository: SettingsRepository,
  ) {}

  public getSettings(): UserSettings {
    return this.settingsRepository.load();
  }

  public async saveSettings(settings: UserSettings): Promise<void> {
    const previousSettings = this.getSettings();
    this.settingsRepository.save(settings);
    // The buffer is retuned on the live call rather than on the next one: it
    // is the setting somebody reaches for while the call is going badly.
    this.gateway.setVoiceDelay(settings.voiceDelay);
    audioPlayback.useLatency(voiceDelayPresets[settings.voiceDelay].audioLatency);
    useOpusFrameSize(voiceDelayPresets[settings.voiceDelay].opusFrameMs);
    const snapshot = this.gateway.getSnapshot();
    if (snapshot.connectionState === 'connected') {
      await this.gateway.applyMicrophoneOptions(this.microphoneOptions(settings));
    }
    if (snapshot.screenSharing && previousSettings.screenSharePreset !== settings.screenSharePreset) {
      await this.gateway.updateScreenShare(screenSharePresets[this.allowed(settings.screenSharePreset)]);
    }
  }

  /**
   * Joining is three slow things: asking the server for a token, connecting to
   * the voice server, and opening the microphone. They do not depend on each
   * other, so the microphone opens while the other two happen, rather than
   * after them.
   */
  public async join(roomId?: string, { speak = true }: { speak?: boolean } = {}): Promise<void> {
    const settings = this.getSettings();
    this.gateway.setVoiceDelay(settings.voiceDelay);
    audioPlayback.useLatency(voiceDelayPresets[settings.voiceDelay].audioLatency);
    useOpusFrameSize(voiceDelayPresets[settings.voiceDelay].opusFrameMs);
    const microphone = this.microphoneOptions(settings);
    // Somebody who may not speak in this room does not have their microphone
    // opened, even for a moment.
    if (speak) this.gateway.prepareMicrophone(microphone);
    await this.gateway.join({
      roomId: roomId ?? settings.roomId,
      participantName: settings.displayName,
    });
    await this.gateway.setMicrophoneEnabled(true, microphone);
  }

  /** A channel under the pointer is probably the next one clicked. */
  public prepareRoom(roomId: string): void {
    if (this.gateway.getSnapshot().connectionState !== 'disconnected' && this.getSettings().roomId === roomId)
      return;
    this.gateway.prepare({ roomId, participantName: this.getSettings().displayName });
  }

  /** Clicking a voice channel is the whole act of joining it. */
  public async enterRoom(roomId: string, options: { speak?: boolean } = {}): Promise<void> {
    const settings = { ...this.getSettings(), roomId };
    this.settingsRepository.save(settings);
    if (this.gateway.getSnapshot().connectionState !== 'disconnected') {
      // The next room's token is asked for while this one is being left.
      this.gateway.prepare({ roomId, participantName: settings.displayName });
      await this.gateway.leave();
    }
    await this.join(roomId, options);
  }

  public async toggleMicrophone(): Promise<void> {
    const settings = this.getSettings();
    const enabled = !this.gateway.getSnapshot().microphoneEnabled;
    await this.gateway.setMicrophoneEnabled(enabled, this.microphoneOptions(settings));
  }

  public async toggleDeafen(): Promise<void> {
    await this.gateway.setDeafened(!this.gateway.getSnapshot().deafened);
  }

  /** Changing quality keeps the same capture and publication alive. */
  public async setScreenQuality(preset: ScreenSharePresetName): Promise<void> {
    const settings = { ...this.getSettings(), screenSharePreset: preset };
    this.settingsRepository.save(settings);
    if (!this.gateway.getSnapshot().screenSharing) return;
    await this.gateway.updateScreenShare(screenSharePresets[this.allowed(preset)]);
  }

  /** A quality the operator of this Pulse Room allows: the one asked for, or their limit. */
  private allowed(preset: ScreenSharePresetName): ScreenSharePresetName {
    return withinCeiling(preset, this.gateway.getSnapshot().screenShareCeiling);
  }

  public async toggleScreenShare(sourceId?: string): Promise<void> {
    if (this.gateway.getSnapshot().screenSharing) {
      await this.gateway.stopScreenShare();
      return;
    }

    if (sourceId && window.desktop) {
      await window.desktop.capture.selectSource(sourceId);
    }

    const preset = screenSharePresets[this.allowed(this.getSettings().screenSharePreset)];
    await this.gateway.startScreenShare(preset);
  }

  private microphoneOptions(settings: UserSettings): MicrophoneOptions {
    return {
      deviceId: settings.microphoneDeviceId,
      gain: settings.microphoneGain / 100,
      echoCancellation: settings.echoCancellation,
      noiseSuppression: settings.noiseSuppression,
      autoGainControl: settings.autoGainControl,
      noiseGateThreshold: noiseGateThresholdDb(settings.noiseGate),
      voiceIsolation: settings.voiceIsolation,
      // One dial moves both buffers, because a person asking for less delay
      // does not care which of them was holding their voice.
      latencyHint: voiceDelayPresets[settings.voiceDelay].audioLatency,
    };
  }
}
