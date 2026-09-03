import { describe, expect, it, vi } from 'vitest';
import { ConferenceController } from '../../src/renderer/application/conference-controller';
import type { ConferenceGateway } from '../../src/renderer/application/ports/conference-gateway';
import type { SettingsRepository } from '../../src/renderer/application/ports/settings-repository';
import type { ConferenceSnapshot } from '../../src/renderer/domain/conference';
import { defaultSettings } from '../../src/renderer/infrastructure/persistence/local-settings-repository';

function createGateway(): ConferenceGateway {
  const snapshot: ConferenceSnapshot = {
    connectionState: 'disconnected',
    participants: [],
    microphoneEnabled: true,
    deafened: false,
    screenSharing: false,
  };
  return {
    subscribe: vi.fn(() => () => undefined),
    getSnapshot: vi.fn(() => snapshot),
    join: vi.fn(async () => undefined),
    leave: vi.fn(async () => undefined),
    setMicrophoneEnabled: vi.fn(async () => undefined),
    setDeafened: vi.fn(async () => undefined),
    startScreenShare: vi.fn(async () => undefined),
    stopScreenShare: vi.fn(async () => undefined),
    setParticipantVolume: vi.fn(),
  };
}

describe('ConferenceController', () => {
  it('joins with persisted identity and audio processing preferences', async () => {
    const gateway = createGateway();
    const settingsRepository: SettingsRepository = {
      load: () => ({ ...defaultSettings, displayName: 'Sam', roomId: 'night-room' }),
      save: vi.fn(),
    };
    const controller = new ConferenceController(gateway, settingsRepository);

    await controller.join();

    expect(gateway.join).toHaveBeenCalledWith({ participantName: 'Sam', roomId: 'night-room' });
    expect(gateway.setMicrophoneEnabled).toHaveBeenCalledWith(true, expect.objectContaining({
      noiseSuppression: true,
      echoCancellation: true,
      gain: 1,
    }));
  });

  it('uses the chosen quality strategy for screen sharing', async () => {
    const gateway = createGateway();
    const settingsRepository: SettingsRepository = {
      load: () => ({ ...defaultSettings, screenSharePreset: 'motion' }),
      save: vi.fn(),
    };
    const controller = new ConferenceController(gateway, settingsRepository);

    await controller.toggleScreenShare();

    expect(gateway.startScreenShare).toHaveBeenCalledWith(expect.objectContaining({
      width: 1920,
      height: 1080,
      frameRate: 60,
      maxBitrate: 7_000_000,
    }));
  });
});
