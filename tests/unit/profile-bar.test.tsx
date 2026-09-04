import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ProfileBar } from '../../src/renderer/components/profile-bar';
import { TooltipProvider } from '../../src/renderer/components/ui/tooltip';

afterEach(cleanup);

/**
 * What the bar renders and what its plain controls do. The panels it opens are
 * Radix overlays, which are asserted in the Electron tests: a real engine
 * positions them, and jsdom slows to a crawl once several have been opened.
 */
function renderBar(overrides: Partial<Parameters<typeof ProfileBar>[0]> = {}) {
  const onToggleMicrophone = vi.fn();
  render(
    <TooltipProvider>
      <ProfileBar
      displayName="Merge lounge"
      joined
      busy={false}
      microphoneEnabled
      deafened={false}
      devices={{ microphones: [{ id: 'usb-1', label: 'USB microphone' }], speakers: [] }}
      user={{ id: 'u', username: 'merge', displayName: 'Merge lounge', avatarId: 'a'.repeat(64) }}
      onToggleMicrophone={onToggleMicrophone}
      onToggleDeafen={vi.fn()}
      onSelectMicrophone={vi.fn()}
      onSelectSpeaker={vi.fn()}
      onOpenSettings={vi.fn()}
        {...overrides}
      />
    </TooltipProvider>,
  );
  return { onToggleMicrophone };
}

describe('ProfileBar', () => {
  it('shows who you are and whether you are in voice', () => {
    renderBar();

    expect(screen.getByText('Merge lounge')).toBeInTheDocument();
    expect(screen.getByText('In voice')).toBeInTheDocument();
  });

  it('gives the person one panel, reached from the picture or the name', () => {
    renderBar();

    const profile = screen.getByRole('button', { name: 'Your profile' });
    expect(profile).toHaveTextContent('Merge lounge');
    expect(profile).toHaveTextContent('In voice');
    // The theme lives inside that panel, so no icon stands alone for it.
    expect(screen.queryByRole('button', { name: /theme/i })).not.toBeInTheDocument();
  });

  it('mutes from the bar while a call is running', () => {
    const { onToggleMicrophone } = renderBar();

    fireEvent.click(screen.getByRole('button', { name: 'Mute microphone' }));

    expect(onToggleMicrophone).toHaveBeenCalledTimes(1);
  });

  it('leaves the controls alone when there is no call', () => {
    renderBar({ joined: false, microphoneEnabled: false });

    expect(screen.getByRole('button', { name: 'Unmute microphone' })).toBeDisabled();
    expect(screen.getByText('Ready')).toBeInTheDocument();
  });
});
