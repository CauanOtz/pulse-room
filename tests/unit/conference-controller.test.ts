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
    watching: [],
  };
  return {
    subscribe: vi.fn(() => () => undefined),
    getSnapshot: vi.fn(() => snapshot),
    join: vi.fn(async () => undefined),
    leave: vi.fn(async () => undefined),
    watchScreen: vi.fn(),
    previewScreen: vi.fn(),
    setVoiceDelay: vi.fn(),
    readHealth: vi.fn(async () => []),
    readConnection: vi.fn(async () => ({ samples: [] })),
    prepare: vi.fn(),
    prepareMicrophone: vi.fn(),
    setMicrophoneEnabled: vi.fn(async () => undefined),
    applyMicrophoneOptions: vi.fn(async () => undefined),
    setDeafened: vi.fn(async () => undefined),
    startScreenShare: vi.fn(async () => undefined),
    updateScreenShare: vi.fn(async () => undefined),
    stopScreenShare: vi.fn(async () => undefined),
    setParticipantVolume: vi.fn(),
    setParticipantMuted: vi.fn(),
  };
}

describe('ConferenceController', () => {
  it('retunes a live microphone instead of republishing it', async () => {
    const gateway = createGateway();
    vi.mocked(gateway.getSnapshot).mockReturnValue({
      connectionState: 'connected',
      participants: [],
      microphoneEnabled: true,
      deafened: false,
      screenSharing: false,
      watching: [],
    });
    const settingsRepository: SettingsRepository = { load: () => defaultSettings, save: vi.fn() };
    const controller = new ConferenceController(gateway, settingsRepository);

    await controller.saveSettings({ ...defaultSettings, noiseGate: 20 });

    expect(gateway.applyMicrophoneOptions).toHaveBeenCalledWith(
      expect.objectContaining({
        noiseGateThreshold: -70,
      }),
    );
    expect(gateway.setMicrophoneEnabled).not.toHaveBeenCalled();
  });

  it('joins with persisted identity and audio processing preferences', async () => {
    const gateway = createGateway();
    const settingsRepository: SettingsRepository = {
      load: () => ({ ...defaultSettings, displayName: 'Sam', roomId: 'night-room' }),
      save: vi.fn(),
    };
    const controller = new ConferenceController(gateway, settingsRepository);

    await controller.join();

    expect(gateway.join).toHaveBeenCalledWith({ participantName: 'Sam', roomId: 'night-room' });
    expect(gateway.setMicrophoneEnabled).toHaveBeenCalledWith(
      true,
      expect.objectContaining({
        noiseSuppression: true,
        echoCancellation: true,
        gain: 1,
      }),
    );
  });

  it('uses the chosen quality strategy for screen sharing', async () => {
    const gateway = createGateway();
    const settingsRepository: SettingsRepository = {
      load: () => ({ ...defaultSettings, screenSharePreset: 'motion' }),
      save: vi.fn(),
    };
    const controller = new ConferenceController(gateway, settingsRepository);

    await controller.toggleScreenShare();

    expect(gateway.startScreenShare).toHaveBeenCalledWith(
      expect.objectContaining({
        width: 1920,
        height: 1080,
        frameRate: 60,
        maxBitrate: 7_000_000,
      }),
    );
  });

  it('retunes an active screen share without stopping or republishing it', async () => {
    const gateway = createGateway();
    vi.mocked(gateway.getSnapshot).mockReturnValue({
      connectionState: 'connected',
      participants: [],
      microphoneEnabled: true,
      deafened: false,
      screenSharing: true,
      watching: [],
    });
    const settingsRepository: SettingsRepository = {
      load: () => defaultSettings,
      save: vi.fn(),
    };
    const controller = new ConferenceController(gateway, settingsRepository);

    await controller.setScreenQuality('motion');

    expect(settingsRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({ screenSharePreset: 'motion' }),
    );
    expect(gateway.updateScreenShare).toHaveBeenCalledWith(
      expect.objectContaining({ width: 1920, height: 1080, frameRate: 60 }),
    );
    expect(gateway.stopScreenShare).not.toHaveBeenCalled();
    expect(gateway.startScreenShare).not.toHaveBeenCalled();
  });

  it('applies a quality changed in settings to the active screen share', async () => {
    const gateway = createGateway();
    vi.mocked(gateway.getSnapshot).mockReturnValue({
      connectionState: 'connected',
      participants: [],
      microphoneEnabled: true,
      deafened: false,
      screenSharing: true,
      watching: [],
    });
    const settingsRepository: SettingsRepository = {
      load: () => defaultSettings,
      save: vi.fn(),
    };
    const controller = new ConferenceController(gateway, settingsRepository);

    await controller.saveSettings({ ...defaultSettings, screenSharePreset: 'efficient' });

    expect(gateway.updateScreenShare).toHaveBeenCalledWith(
      expect.objectContaining({ width: 1280, height: 720, frameRate: 30 }),
    );
  });

  it('hands new audio settings to the live microphone', async () => {
    const gateway = createGateway();
    const connectedSnapshot: ConferenceSnapshot = {
      connectionState: 'connected',
      participants: [],
      microphoneEnabled: true,
      deafened: false,
      screenSharing: false,
      watching: [],
    };
    vi.mocked(gateway.getSnapshot).mockReturnValue(connectedSnapshot);
    const settingsRepository: SettingsRepository = {
      load: () => defaultSettings,
      save: vi.fn(),
    };
    const controller = new ConferenceController(gateway, settingsRepository);
    const settings = { ...defaultSettings, microphoneGain: 125, noiseSuppression: false };

    await controller.saveSettings(settings);

    expect(settingsRepository.save).toHaveBeenCalledWith(settings);
    expect(gateway.applyMicrophoneOptions).toHaveBeenCalledWith(
      expect.objectContaining({
        gain: 1.25,
        noiseSuppression: false,
      }),
    );
  });
});

describe('microphone options', () => {
  it('translates the noise gate strength into a threshold in decibels', async () => {
    const gateway = createGateway();
    const settingsRepository: SettingsRepository = {
      load: () => ({ ...defaultSettings, noiseGate: 100 }),
      save: vi.fn(),
    };
    const controller = new ConferenceController(gateway, settingsRepository);

    await controller.join();

    expect(gateway.setMicrophoneEnabled).toHaveBeenCalledWith(
      true,
      expect.objectContaining({
        noiseGateThreshold: -30,
      }),
    );
  });
});

describe('entering voice channels', () => {
  it('rejoins in the new room when a call is already running', async () => {
    const gateway = createGateway();
    vi.mocked(gateway.getSnapshot).mockReturnValue({
      connectionState: 'connected',
      participants: [],
      microphoneEnabled: true,
      deafened: false,
      screenSharing: false,
      watching: [],
    });
    const save = vi.fn();
    const controller = new ConferenceController(gateway, { load: () => defaultSettings, save });

    await controller.enterRoom('game-room');

    expect(save).toHaveBeenCalledWith(expect.objectContaining({ roomId: 'game-room' }));
    expect(gateway.leave).toHaveBeenCalledTimes(1);
    expect(gateway.join).toHaveBeenCalledTimes(1);
  });

  it('joins straight away when no call is running', async () => {
    const gateway = createGateway();
    const save = vi.fn();
    const controller = new ConferenceController(gateway, { load: () => defaultSettings, save });

    await controller.enterRoom('game-room');

    expect(save).toHaveBeenCalledWith(expect.objectContaining({ roomId: 'game-room' }));
    expect(gateway.leave).not.toHaveBeenCalled();
    expect(gateway.join).toHaveBeenCalledWith(expect.objectContaining({ roomId: 'game-room' }));
  });
});

describe('joining without waiting on each step in turn', () => {
  it('opens the microphone before connecting, with the options it then publishes', async () => {
    const gateway = createGateway();
    const order: string[] = [];
    vi.mocked(gateway.prepareMicrophone).mockImplementation(() => void order.push('microphone'));
    vi.mocked(gateway.join).mockImplementation(async () => void order.push('connect'));
    vi.mocked(gateway.setMicrophoneEnabled).mockImplementation(async () => void order.push('publish'));
    const controller = new ConferenceController(gateway, { load: () => defaultSettings, save: vi.fn() });

    await controller.join('lounge');

    expect(order).toEqual(['microphone', 'connect', 'publish']);
    expect(vi.mocked(gateway.prepareMicrophone).mock.calls[0]![0]).toEqual(
      vi.mocked(gateway.setMicrophoneEnabled).mock.calls[0]![1],
    );
  });

  it('does not open the microphone of somebody who may not speak there', async () => {
    const gateway = createGateway();
    const controller = new ConferenceController(gateway, { load: () => defaultSettings, save: vi.fn() });

    await controller.enterRoom('stage', { speak: false });

    expect(gateway.prepareMicrophone).not.toHaveBeenCalled();
    expect(gateway.join).toHaveBeenCalled();
  });

  it('asks for the next room while leaving the current one', async () => {
    const gateway = createGateway();
    vi.mocked(gateway.getSnapshot).mockReturnValue({
      connectionState: 'connected',
      participants: [],
      microphoneEnabled: true,
      deafened: false,
      screenSharing: false,
      watching: [],
    });
    const order: string[] = [];
    vi.mocked(gateway.prepare).mockImplementation(() => void order.push('prepare'));
    vi.mocked(gateway.leave).mockImplementation(async () => void order.push('leave'));
    const controller = new ConferenceController(gateway, {
      load: () => ({ ...defaultSettings, displayName: 'merge', roomId: 'lounge' }),
      save: vi.fn(),
    });

    await controller.enterRoom('game-room');

    expect(order).toEqual(['prepare', 'leave']);
    expect(gateway.prepare).toHaveBeenCalledWith({ roomId: 'game-room', participantName: 'merge' });
  });

  it('gets a room ready from the pointer, but not the one already joined', () => {
    const gateway = createGateway();
    const controller = new ConferenceController(gateway, {
      load: () => ({ ...defaultSettings, displayName: 'merge', roomId: 'lounge' }),
      save: vi.fn(),
    });

    controller.prepareRoom('game-room');
    expect(gateway.prepare).toHaveBeenCalledWith({ roomId: 'game-room', participantName: 'merge' });

    vi.mocked(gateway.getSnapshot).mockReturnValue({
      ...gateway.getSnapshot(),
      connectionState: 'connected',
    });
    vi.mocked(gateway.prepare).mockClear();
    controller.prepareRoom('lounge');
    expect(gateway.prepare).not.toHaveBeenCalled();
  });
});

describe('the quality limit set by the operator', () => {
  it('shares at the limit when the saved quality asks for more, and changes to no more than it', async () => {
    const gateway = createGateway();
    vi.mocked(gateway.getSnapshot).mockReturnValue({
      connectionState: 'connected',
      participants: [],
      microphoneEnabled: true,
      deafened: false,
      screenSharing: false,
      watching: [],
      screenShareCeiling: 'efficient',
    });
    const controller = new ConferenceController(gateway, {
      load: () => ({ ...defaultSettings, screenSharePreset: 'motion' }),
      save: vi.fn(),
    });

    await controller.toggleScreenShare();
    expect(gateway.startScreenShare).toHaveBeenCalledWith(
      expect.objectContaining({ width: 1280, frameRate: 30 }),
    );

    vi.mocked(gateway.getSnapshot).mockReturnValue({ ...gateway.getSnapshot(), screenSharing: true });
    await controller.setScreenQuality('balanced');
    expect(gateway.updateScreenShare).toHaveBeenCalledWith(expect.objectContaining({ width: 1280 }));
  });
});
