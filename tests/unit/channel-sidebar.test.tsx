import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ChannelSidebar } from '../../src/renderer/components/channel-sidebar';
import { voiceChannels } from '../../src/renderer/domain/conference';

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
  const onSelectMicrophone = vi.fn();
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
      displayName="You"
      microphoneEnabled
      deafened={false}
      joined
      busy={false}
      screenSharing={false}
      devices={{ microphones: [{ id: 'usb-1', label: 'USB microphone' }], speakers: [] }}
      occupancy={[]}
      onSelectChannel={onSelectChannel}
      onOpenParticipant={onOpenParticipant}
      onToggleMicrophone={vi.fn()}
      onToggleDeafen={vi.fn()}
      onSelectMicrophone={onSelectMicrophone}
      onSelectSpeaker={vi.fn()}
      onLeave={onLeave}
      onShare={onShare}
      onOpenSettings={vi.fn()}
      {...overrides}
    />,
  );
  return { onSelectChannel, onOpenParticipant, onSelectMicrophone, onLeave, onShare };
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

  it('changes the microphone from the caret beside it', () => {
    const { onSelectMicrophone } = renderSidebar();

    openMenu('Choose microphone');
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'USB microphone' }));

    expect(onSelectMicrophone).toHaveBeenCalledWith('usb-1');
  });

  it('offers the system default as a way back', () => {
    const { onSelectMicrophone } = renderSidebar({ microphoneDeviceId: 'usb-1' });

    openMenu('Choose microphone');
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'System default' }));

    expect(onSelectMicrophone).toHaveBeenCalledWith(undefined);
  });
});
