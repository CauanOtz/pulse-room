import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Stage } from '../../src/renderer/components/stage';
import type { Participant } from '../../src/renderer/domain/conference';

function createParticipant(overrides: Partial<Participant> & Pick<Participant, 'id' | 'name'>): Participant {
  return {
    initials: overrides.name.slice(0, 2).toUpperCase(),
    accent: '#a8bdff',
    isLocal: false,
    isMuted: false,
    isSpeaking: false,
    volume: 100,
    ...overrides,
  };
}

const requestFullscreen = vi.fn(async () => undefined);
const exitFullscreen = vi.fn(async () => undefined);

beforeEach(() => {
  Element.prototype.requestFullscreen = requestFullscreen;
  Object.defineProperty(document, 'exitFullscreen', { configurable: true, value: exitFullscreen });
  Object.defineProperty(document, 'fullscreenElement', { configurable: true, writable: true, value: null });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('Stage', () => {
  it('invites the room in when nobody is broadcasting', () => {
    render(<Stage participants={[createParticipant({ id: 'maya', name: 'Maya' })]} joined />);

    expect(screen.getByRole('heading', { name: 'The room is yours' })).toBeInTheDocument();
  });

  it('lets a viewer switch between two live screens', () => {
    const participants = [
      createParticipant({ id: 'you', name: 'You', isLocal: true, screenStream: new MediaStream() }),
      createParticipant({ id: 'maya', name: 'Maya', screenStream: new MediaStream() }),
    ];

    render(<Stage participants={participants} joined />);

    // A friend's screen wins the default so the local capture never mirrors itself.
    expect(screen.getByText('Live from Maya')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: 'Your screen' }));

    expect(screen.getByText('Live from your screen')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Your screen' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'Maya' })).toHaveAttribute('aria-selected', 'false');
  });

  it('still previews your own screen when you are the only one live', () => {
    const participants = [
      createParticipant({ id: 'you', name: 'You', isLocal: true, screenStream: new MediaStream() }),
      createParticipant({ id: 'maya', name: 'Maya' }),
    ];

    render(<Stage participants={participants} joined />);

    expect(screen.getByText('Live from your screen')).toBeInTheDocument();
  });

  it('offers no switcher while a single screen is live', () => {
    const participants = [createParticipant({ id: 'maya', name: 'Maya', screenStream: new MediaStream() })];

    render(<Stage participants={participants} joined />);

    expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
    expect(screen.getByText('Live from Maya')).toBeInTheDocument();
  });

  it('enlarges the live screen on request', () => {
    const participants = [createParticipant({ id: 'maya', name: 'Maya', screenStream: new MediaStream() })];

    render(<Stage participants={participants} joined />);
    fireEvent.click(screen.getByRole('button', { name: 'Enter full screen' }));

    expect(requestFullscreen).toHaveBeenCalledTimes(1);
  });

  it('leaves full screen when the broadcast it was showing ends', () => {
    const live = [createParticipant({ id: 'maya', name: 'Maya', screenStream: new MediaStream() })];
    const { rerender } = render(<Stage participants={live} joined />);

    Object.defineProperty(document, 'fullscreenElement', {
      configurable: true,
      writable: true,
      value: document.querySelector('.stage'),
    });
    rerender(<Stage participants={[createParticipant({ id: 'maya', name: 'Maya' })]} joined />);

    expect(exitFullscreen).toHaveBeenCalledTimes(1);
  });
});
