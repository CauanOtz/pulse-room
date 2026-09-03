import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ChannelSidebar } from '../../src/renderer/components/channel-sidebar';
import { voiceChannels } from '../../src/renderer/domain/conference';

afterEach(cleanup);

function renderSidebar(overrides: Partial<Parameters<typeof ChannelSidebar>[0]> = {}) {
  const onSelectChannel = vi.fn();
  const onOpenParticipant = vi.fn();
  render(
    <ChannelSidebar
      connectionState="connected"
      channels={voiceChannels}
      activeChannelId="lounge"
      participants={[
        { id: 'you', name: 'You', initials: 'YO', accent: '#a8bdff', isLocal: true, isMuted: false, isSpeaking: false, volume: 100, locallyMuted: false },
      ]}
      displayName="You"
      microphoneEnabled
      deafened={false}
      busy={false}
      occupancy={[]}
      onSelectChannel={onSelectChannel}
      onOpenParticipant={onOpenParticipant}
      onOpenSettings={vi.fn()}
      {...overrides}
    />,
  );
  return { onSelectChannel, onOpenParticipant };
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
    expect(screen.getByText('Lounge · 1 people').closest('aside')?.querySelector('.roster-entry')).toHaveTextContent('You');
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
});
