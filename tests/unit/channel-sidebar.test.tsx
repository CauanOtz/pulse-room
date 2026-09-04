import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ChannelSidebar } from '../../src/renderer/components/channel-sidebar';
import { TooltipProvider } from '../../src/renderer/components/ui/tooltip';
import { voiceChannels } from '../../src/renderer/domain/conference';
import type { CommunityChannel } from '../../src/shared/community';

afterEach(cleanup);

/** Radix opens on pointer down, which is what a mouse actually sends first. */
const openMenu = (name: string) => {
  const trigger = screen.getByRole('button', { name });
  fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false, pointerType: 'mouse' });
  fireEvent.click(trigger);
};

function renderSidebar(overrides: Partial<Parameters<typeof ChannelSidebar>[0]> = {}) {
  const onSelectChannel = vi.fn();
  const onOpenParticipant = vi.fn();
  const onLeave = vi.fn();
  const onShare = vi.fn();
  render(
    <ChannelSidebar
      connectionState="connected"
      channels={voiceChannels}
      activeChannelId="lounge"
      participants={[
        { id: 'you', name: 'You', initials: 'YO', accent: '#a8bdff', isLocal: true, isMuted: false, isSpeaking: false, volume: 100, locallyMuted: false },
      ]}
      joined
      busy={false}
      screenSharing={false}
      occupancy={[]}
      onSelectChannel={onSelectChannel}
      onOpenParticipant={onOpenParticipant}
      onLeave={onLeave}
      onShare={onShare}
      {...overrides}
    />,
  );
  return { onSelectChannel, onOpenParticipant, onLeave, onShare };
}

describe('ChannelSidebar', () => {
  it('moves the room to the voice channel that was chosen', () => {
    const { onSelectChannel } = renderSidebar();

    fireEvent.click(screen.getByRole('button', { name: 'Game room' }));

    expect(onSelectChannel).toHaveBeenCalledWith('game-room');
  });

  it('marks the channel you are in and lists who is there', () => {
    renderSidebar();

    expect(screen.getByRole('button', { name: 'Lounge' })).toHaveAttribute('aria-current', 'true');
    expect(screen.getByText('Lounge · 1 people')).toBeInTheDocument();
    expect(screen.getByRole('complementary').querySelector('.roster-entry')).toHaveTextContent('You');
  });

  it('holds still while a switch is in flight', () => {
    const { onSelectChannel } = renderSidebar({ busy: true });

    fireEvent.click(screen.getByRole('button', { name: 'Game room' }));

    expect(onSelectChannel).not.toHaveBeenCalled();
  });

  it('shows who is waiting in a channel nobody here joined', () => {
    renderSidebar({
      occupancy: [{ roomId: 'game-room', occupants: [{ identity: 'babi-1', name: 'babi' }] }],
    });

    expect(screen.getByRole('button', { name: 'babi' })).toBeInTheDocument();
  });

  it('opens audio options for a friend on a right click', () => {
    const { onOpenParticipant } = renderSidebar({
      participants: [
        { id: 'babi', name: 'babi', initials: 'BA', accent: '#ee8d72', isLocal: false, isMuted: false, isSpeaking: true, volume: 100, locallyMuted: false },
      ],
    });

    fireEvent.contextMenu(screen.getByRole('button', { name: 'Audio options for babi' }));

    expect(onOpenParticipant).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'babi', name: 'babi' }),
      expect.objectContaining({ x: expect.any(Number), y: expect.any(Number) }),
    );
  });

  it('carries the voice controls beside the person they belong to', () => {
    const { onLeave, onShare } = renderSidebar();

    fireEvent.click(screen.getByRole('button', { name: 'Share full screen' }));
    fireEvent.click(screen.getByRole('button', { name: 'Leave call' }));

    expect(onShare).toHaveBeenCalledTimes(1);
    expect(onLeave).toHaveBeenCalledTimes(1);
  });

});

const textChannel: CommunityChannel = {
  id: 'text-1',
  serverId: 'server',
  name: 'general',
  type: 'text',
  private: false,
  memberIds: [],
  allowSpeak: true,
  allowShare: true,
  readOnly: false,
};

/** The controls that shape a server exist only for somebody who may use them. */
function renderManaged(overrides: Partial<Parameters<typeof ChannelSidebar>[0]> = {}) {
  const onCreateChannel = vi.fn();
  const onEditChannel = vi.fn();
  const onSelectChannel = vi.fn();
  render(
    <TooltipProvider>
      <ChannelSidebar
        connectionState="disconnected"
        channels={voiceChannels}
        textChannels={[textChannel]}
        activeChannelId="lounge"
        participants={[]}
        joined={false}
        busy={false}
        screenSharing={false}
        occupancy={[]}
        onSelectChannel={onSelectChannel}
        onOpenParticipant={() => {}}
        onLeave={() => {}}
        onShare={() => {}}
        onCreateChannel={onCreateChannel}
        onEditChannel={onEditChannel}
        {...overrides}
      />
    </TooltipProvider>,
  );
  return { onCreateChannel, onEditChannel, onSelectChannel };
}

describe('shaping a server from the list itself', () => {
  it('opens the channel the gear belongs to, and does not enter it', () => {
    const { onEditChannel, onSelectChannel } = renderManaged();

    fireEvent.click(screen.getByRole('button', { name: 'Edit Lounge' }));
    fireEvent.click(screen.getByRole('button', { name: 'Edit general' }));

    expect(onEditChannel).toHaveBeenNthCalledWith(1, 'lounge');
    expect(onEditChannel).toHaveBeenNthCalledWith(2, 'text-1');
    expect(onSelectChannel).not.toHaveBeenCalled();
  });

  it('still opens a channel while a switch is in flight', () => {
    const { onEditChannel } = renderManaged({ busy: true });

    fireEvent.click(screen.getByRole('button', { name: 'Edit Lounge' }));

    expect(onEditChannel).toHaveBeenCalledWith('lounge');
  });

  it('makes a channel of the group whose plus was pressed', () => {
    const { onCreateChannel } = renderManaged();

    fireEvent.click(screen.getByRole('button', { name: 'Create text channel' }));
    fireEvent.click(screen.getByRole('button', { name: 'Create voice channel' }));

    expect(onCreateChannel).toHaveBeenNthCalledWith(1, 'text');
    expect(onCreateChannel).toHaveBeenNthCalledWith(2, 'voice');
  });

  it('offers neither control to a member who may not use them', () => {
    renderManaged({ onCreateChannel: undefined, onEditChannel: undefined });

    expect(screen.queryByRole('button', { name: 'Edit Lounge' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Create voice channel' })).toBeNull();
  });
});
