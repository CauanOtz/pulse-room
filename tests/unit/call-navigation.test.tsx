import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ConferenceGateway } from '../../src/renderer/application/ports/conference-gateway';
import type { ConferenceSnapshot } from '../../src/renderer/domain/conference';
import type { CommunityClient } from '../../src/renderer/infrastructure/community-client';
import type { WorkspaceBindings } from '../../src/renderer/community-root';
import type { CommunityDetail } from '../../src/shared/community';
import { TooltipProvider } from '../../src/renderer/components/ui/tooltip';

const gatewayFactory = vi.hoisted(() => ({ create: vi.fn() }));

vi.mock('../../src/renderer/infrastructure/conference/conference-gateway-factory', () => ({
  ConferenceGatewayFactory: gatewayFactory,
}));

import { App } from '../../src/renderer/app';

function conferenceGateway() {
  let snapshot: ConferenceSnapshot = {
    connectionState: 'disconnected',
    participants: [],
    microphoneEnabled: false,
    deafened: false,
    screenSharing: false,
    watching: [],
  };
  const listeners = new Set<() => void>();
  const update = (patch: Partial<ConferenceSnapshot>) => {
    snapshot = { ...snapshot, ...patch };
    listeners.forEach((listener) => listener());
  };
  const gateway: ConferenceGateway = {
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getSnapshot: () => snapshot,
    join: vi.fn(async ({ participantName }) => {
      update({
        connectionState: 'connected',
        participants: [
          {
            id: 'owner',
            name: participantName,
            initials: 'OW',
            accent: '#ffffff',
            isLocal: true,
            isMuted: false,
            isSpeaking: false,
            volume: 100,
            locallyMuted: false,
            isBroadcasting: false,
          },
        ],
      });
    }),
    leave: vi.fn(async () => update({ connectionState: 'disconnected', participants: [] })),
    setMicrophoneEnabled: vi.fn(async (enabled) => update({ microphoneEnabled: enabled })),
    applyMicrophoneOptions: vi.fn(async () => {}),
    setDeafened: vi.fn(async (deafened) => update({ deafened })),
    startScreenShare: vi.fn(async () => update({ screenSharing: true })),
    updateScreenShare: vi.fn(async () => undefined),
    stopScreenShare: vi.fn(async () => update({ screenSharing: false })),
    setParticipantVolume: vi.fn(),
    setParticipantMuted: vi.fn(),
    watchScreen: vi.fn(),
    previewScreen: vi.fn(),
    setVoiceDelay: vi.fn(),
    readHealth: vi.fn(async () => []),
  };
  return gateway;
}

const api = {
  url: 'http://example.test',
  token: 'session',
  request: vi.fn(async (path: string) => {
    if (path.startsWith('/api/presence')) return { rooms: [] };
    if (path.endsWith('/messages')) return { messages: [] };
    return {};
  }),
  upload: vi.fn(),
} as unknown as CommunityClient;

function detail(id: string, name: string): CommunityDetail {
  return {
    server: { id, name, role: 'owner' },
    members: [{ id: 'owner', username: 'owner', displayName: 'Owner', role: 'owner' }],
    channels: [
      {
        id: `text-${id}`,
        serverId: id,
        name: 'general',
        type: 'text',
        private: false,
        memberIds: [],
        allowSpeak: true,
        allowShare: true,
        readOnly: false,
      },
      {
        id: `voice-${id}`,
        serverId: id,
        name: name === 'Friends' ? 'Game room' : 'Quiet room',
        type: 'voice',
        private: false,
        memberIds: [],
        allowSpeak: true,
        allowShare: true,
        readOnly: false,
      },
    ],
  };
}

function workspace(current: CommunityDetail, onSelectServer = vi.fn()): WorkspaceBindings {
  return {
    api,
    user: { id: 'owner', username: 'owner', displayName: 'Owner' },
    detail: current,
    servers: [
      { id: 'friends', name: 'Friends', role: 'owner' },
      { id: 'couple', name: 'Just us', role: 'owner' },
    ],
    onSelectServer,
    onAddServer: vi.fn(),
    onManage: vi.fn(),
    onCreateChannel: vi.fn(),
    onEditChannel: vi.fn(),
    onAccount: vi.fn(),
    onProfileChanged: vi.fn(async () => {}),
  };
}

beforeEach(() => {
  window.localStorage.clear();
  vi.clearAllMocks();
});

afterEach(cleanup);

describe('call navigation', () => {
  it('keeps the call mounted while another server is opened and can return to it', async () => {
    const gateway = conferenceGateway();
    gatewayFactory.create.mockReturnValue(gateway);
    const friends = workspace(detail('friends', 'Friends'));
    const returnToServer = vi.fn();
    const couple = workspace(detail('couple', 'Just us'), returnToServer);

    const view = render(
      <TooltipProvider>
        <App workspace={friends} />
      </TooltipProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Game room' }));
    await waitFor(() =>
      expect(screen.getByLabelText('Voice status')).toHaveTextContent('Game room'),
    );

    view.rerender(
      <TooltipProvider>
        <App workspace={couple} />
      </TooltipProvider>,
    );

    expect(gateway.leave).not.toHaveBeenCalled();
    // The call names itself and the server it belongs to, wherever you browse.
    expect(screen.getByLabelText('Voice status')).toHaveTextContent('Game room');
    expect(screen.getByLabelText('Voice status')).toHaveTextContent('Friends');
    fireEvent.click(
      within(screen.getByLabelText('Voice status')).getByRole('button', { name: 'Return to call' }),
    );
    expect(returnToServer).toHaveBeenCalledWith('friends');
  });
});
