import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Stage } from '../../src/renderer/components/stage';
import { TooltipProvider } from '../../src/renderer/components/ui/tooltip';
import type { Participant } from '../../src/renderer/domain/conference';

function createParticipant(overrides: Partial<Participant> & Pick<Participant, 'id' | 'name'>): Participant {
  return {
    initials: overrides.name.slice(0, 2).toUpperCase(),
    accent: '#a8bdff',
    isLocal: false,
    isMuted: false,
    isSpeaking: false,
    volume: 100,
    locallyMuted: false,
    isBroadcasting: Boolean(overrides.screenStream),
    ...overrides,
  };
}

/** A screen on the wire: an empty stream is a broadcast nobody subscribed to. */
const liveScreen = () =>
  new MediaStream([{ kind: 'video', id: 'screen', stop: () => undefined } as MediaStreamTrack]);

/**
 * The stage does not choose what to show; the room does. This holds that choice
 * the way the application does, so a test can click and see the result.
 */
function Watchable({
  participants,
  initial,
  ...props
}: { participants: Participant[]; initial?: string } & Record<string, unknown>) {
  const [watching, setWatching] = useState<string[]>(initial ? [initial] : []);
  return (
    // The application wraps the whole window in one provider so that sweeping
    // across a row of controls does not wait for each hint in turn.
    <TooltipProvider>
    <Stage
      participants={participants}
      joined
      watching={watching}
      onWatch={(participantId, watch) =>
        setWatching((taken) =>
          watch ? [...new Set([...taken, participantId])] : taken.filter((id) => id !== participantId),
        )
      }
      {...props}
    />
    </TooltipProvider>
  );
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
  it('invites you in before you have joined anywhere', () => {
    render(<Stage participants={[]} joined={false} onWatch={() => undefined} />);

    expect(screen.getByRole('heading', { name: 'Come as you are' })).toBeInTheDocument();
  });

  it('shows the room as tiles while no screen is live', () => {
    const participants = [
      createParticipant({ id: 'you', name: 'You', isLocal: true }),
      createParticipant({ id: 'maya', name: 'Maya', isSpeaking: true }),
    ];

    render(<Watchable participants={participants} />);

    expect(screen.getByRole('button', { name: 'Maya' })).toBeDisabled();
    expect(document.querySelectorAll('.participant-tile')).toHaveLength(2);
    expect(document.querySelector('.participant-tile.is-speaking')).toHaveTextContent('Maya');
  });

  it('shows nobody a screen they did not ask for', () => {
    const participants = [
      createParticipant({ id: 'you', name: 'You', isLocal: true }),
      createParticipant({ id: 'maya', name: 'Maya', screenStream: liveScreen() }),
    ];

    render(<Watchable participants={participants} />);

    // Decoding a screen is the most expensive thing in the room, so a machine
    // that is not looking never starts. The offer lives on the person.
    expect(document.querySelector('video')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Watch Maya' }));

    expect(screen.getByText('Live from Maya')).toBeInTheDocument();
  });

  it('marks who is live, and which of them this machine took', () => {
    const participants = [
      createParticipant({ id: 'you', name: 'You', isLocal: true }),
      createParticipant({ id: 'maya', name: 'Maya', screenStream: liveScreen() }),
      createParticipant({ id: 'ari', name: 'Ari', screenStream: liveScreen() }),
    ];

    render(<Watchable participants={participants} />);

    // Two people are sharing and nobody has been taken, so the room says Live
    // twice and claims to be watching none of it.
    expect(document.querySelectorAll('.tile-live')).toHaveLength(2);
    expect(document.querySelectorAll('.tile-taken')).toHaveLength(0);

    fireEvent.click(screen.getByRole('button', { name: 'Watch Maya' }));
    fireEvent.click(screen.getByRole('button', { name: 'Back to the room' }));

    expect(document.querySelectorAll('.tile-taken')).toHaveLength(1);
  });

  it('draws a ring around whoever is talking, and around nobody else', () => {
    const participants = [
      createParticipant({ id: 'you', name: 'You', isLocal: true }),
      createParticipant({ id: 'maya', name: 'Maya', isSpeaking: true }),
    ];

    render(<Watchable participants={participants} />);

    const rings = [...document.querySelectorAll('.tile-face')].filter((face) =>
      face.className.includes('shadow-['),
    );
    expect(rings).toHaveLength(1);
    expect(rings[0].closest('.participant-tile')).toHaveTextContent('Maya');
  });

  it('shows a struggling line on the tile of whoever owns it', () => {
    const participants = [
      createParticipant({ id: 'you', name: 'You', isLocal: true, signal: 'excellent' }),
      createParticipant({ id: 'maya', name: 'Maya', signal: 'poor' }),
    ];

    render(<Watchable participants={participants} />);

    const bars = [...document.querySelectorAll('.signal-bars')];
    expect(bars).toHaveLength(1);
    expect(bars[0].closest('.participant-tile')).toHaveTextContent('Maya');
  });

  it('puts the picture away without leaving the stream', () => {
    const participants = [createParticipant({ id: 'maya', name: 'Maya', screenStream: liveScreen() })];
    const onWatch = vi.fn();

    render(
      <Stage
        participants={participants}
        joined
        watching={['maya']}
        onWatch={onWatch}
      />,
    );
    expect(screen.getByText('Live from Maya')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Back to the room' }));

    // The room is back and the stream is still running: her tile keeps the
    // picture, and nothing was unsubscribed.
    expect(screen.queryByText('Live from Maya')).not.toBeInTheDocument();
    expect(document.querySelector('.tile-video')).toBeInTheDocument();
    expect(onWatch).not.toHaveBeenCalled();
  });

  it('opens the picture again from the tile it belongs to', () => {
    const participants = [createParticipant({ id: 'maya', name: 'Maya', screenStream: liveScreen() })];

    render(<Stage participants={participants} joined watching={['maya']} onWatch={() => undefined} />);
    fireEvent.click(screen.getByRole('button', { name: 'Back to the room' }));
    fireEvent.click(screen.getByRole('button', { name: 'Watch Maya' }));

    expect(screen.getByText('Live from Maya')).toBeInTheDocument();
  });

  it('asks what to do with somebody on a right click', () => {
    const participants = [createParticipant({ id: 'maya', name: 'Maya', screenStream: liveScreen() })];
    const onOptions = vi.fn();

    render(
      <Stage
        participants={participants}
        joined
        watching={['maya']}
        onWatch={() => undefined}
        onOptions={onOptions}
      />,
    );
    fireEvent.contextMenu(screen.getByRole('button', { name: 'Watch Maya' }));

    // Leaving a stream for good is asked for here, not by closing a window.
    expect(onOptions).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'maya' }),
      expect.objectContaining({ x: expect.any(Number), y: expect.any(Number) }),
    );
  });

  it('lets two screens be taken at once', () => {
    const participants = [
      createParticipant({ id: 'maya', name: 'Maya', screenStream: liveScreen() }),
      createParticipant({ id: 'noah', name: 'Noah', screenStream: liveScreen() }),
    ];

    render(<Watchable participants={participants} initial="maya" />);
    // One fills the room, and only that one is being received.
    expect(screen.getByText('Live from Maya')).toBeInTheDocument();
    expect(document.querySelectorAll('.tile-video')).toHaveLength(1);

    // The other is taken from the strip along the bottom, where they are all
    // standing.
    fireEvent.click(screen.getByRole('button', { name: 'Watch Noah' }));

    // Both are being received now: Noah fills the room, and Maya's tile keeps
    // playing rather than falling back to her face.
    expect(screen.getByText('Live from Noah')).toBeInTheDocument();
    expect(document.querySelectorAll('.tile-video')).toHaveLength(2);
  });

  it('lets a viewer switch between two live screens', () => {
    const participants = [
      createParticipant({ id: 'you', name: 'You', isLocal: true, screenStream: liveScreen() }),
      createParticipant({ id: 'maya', name: 'Maya', screenStream: liveScreen() }),
    ];

    render(<Watchable participants={participants} initial="maya" />);
    expect(screen.getByText('Live from Maya')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Watch You' }));

    expect(screen.getByText('Live from your screen')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Watch You' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Watch Maya' })).toHaveAttribute('aria-pressed', 'false');

    // Clicking the screen you are watching steps back to the room.
    fireEvent.click(screen.getByRole('button', { name: 'Watch You' }));
    expect(screen.queryByText('Live from your screen')).not.toBeInTheDocument();
  });

  it('keeps the room visible as a strip while a screen is live', () => {
    const participants = [
      createParticipant({ id: 'maya', name: 'Maya', screenStream: liveScreen() }),
      createParticipant({ id: 'noah', name: 'Noah' }),
    ];

    render(<Watchable participants={participants} initial="maya" />);

    expect(screen.getByText('Live from Maya')).toBeInTheDocument();
    expect(document.querySelector('.tile-strip')?.querySelectorAll('.participant-tile')).toHaveLength(2);
  });

  it('gives screen audio a level of its own while it is being watched', () => {
    const participants = [createParticipant({ id: 'maya', name: 'Maya', volume: 40, screenStream: liveScreen() })];
    const onScreenVolume = vi.fn();

    const { rerender } = render(
      <Stage
        participants={participants}
        joined
        watching={['maya']}
        onWatch={() => undefined}
        screenVolumes={{ maya: 180 }}
        onScreenVolume={onScreenVolume}
      />,
    );
    // The picture never carries the sound, so leaving it cannot take the music.
    expect(document.querySelector('video')?.muted).toBe(true);
    expect(screen.getByText('180%')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Maya screen volume'), { target: { value: '30' } });
    expect(onScreenVolume).toHaveBeenCalledWith('maya', 30);

    // Leaving the stream leaves its sound behind too, so there is nothing left
    // to turn down.
    rerender(
      <Stage
        participants={participants}
        joined
        onWatch={() => undefined}
        screenVolumes={{ maya: 180 }}
        onScreenVolume={onScreenVolume}
      />,
    );
    expect(screen.queryByLabelText('Maya screen volume')).toBeNull();
  });

  it('offers no screen volume for your own preview, which plays muted', () => {
    const participants = [createParticipant({ id: 'you', name: 'You', isLocal: true, screenStream: liveScreen() })];

    render(<Watchable participants={participants} initial="you" />);

    expect(screen.queryByLabelText(/screen volume/)).not.toBeInTheDocument();
    expect(document.querySelector('video')?.muted).toBe(true);
  });

  it('expands the video levels only when the viewer asks for it', () => {
    const participants = [createParticipant({ id: 'maya', name: 'Maya', screenStream: liveScreen() })];

    const { rerender } = render(<Watchable participants={participants} initial="maya" />);
    expect(document.querySelector('video')).not.toHaveClass('is-expanded');

    rerender(<Watchable participants={participants} initial="maya" expandLevels />);
    expect(document.querySelector('video')).toHaveClass('is-expanded');
  });

  it('steps the controls aside while nobody reaches for them', () => {
    vi.useFakeTimers();
    try {
      const participants = [createParticipant({ id: 'maya', name: 'Maya', screenStream: liveScreen() })];
      render(<Watchable participants={participants} initial="maya" />);
      const toolbar = document.querySelector('.live-toolbar');
      const stage = document.querySelector('.stage-live') as HTMLElement;

      expect(toolbar).not.toHaveClass('is-hidden');

      act(() => {
        vi.advanceTimersByTime(3_000);
      });
      expect(toolbar).toHaveClass('is-hidden');

      act(() => {
        fireEvent.mouseMove(stage);
      });
      expect(toolbar).not.toHaveClass('is-hidden');

      act(() => {
        vi.advanceTimersByTime(3_000);
      });
      expect(toolbar).toHaveClass('is-hidden');
    } finally {
      vi.useRealTimers();
    }
  });

  it('enlarges the live screen on request', () => {
    const participants = [createParticipant({ id: 'maya', name: 'Maya', screenStream: liveScreen() })];

    render(<Watchable participants={participants} initial="maya" />);
    fireEvent.click(screen.getByRole('button', { name: 'Enter full screen' }));

    expect(requestFullscreen).toHaveBeenCalledTimes(1);
  });

  it('leaves full screen when the broadcast it was showing ends', () => {
    const live = [createParticipant({ id: 'maya', name: 'Maya', screenStream: liveScreen() })];
    const { rerender } = render(<Watchable participants={live} initial="maya" />);

    Object.defineProperty(document, 'fullscreenElement', {
      configurable: true,
      writable: true,
      value: document.querySelector('.stage'),
    });
    rerender(<Watchable participants={[createParticipant({ id: 'maya', name: 'Maya' })]} initial="maya" />);

    expect(exitFullscreen).toHaveBeenCalledTimes(1);
  });
});
