import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useSteadySpeaker } from '../../src/renderer/components/steady-speaker';
import type { Participant } from '../../src/renderer/domain/conference';

const person = (id: string, speaking = false, muted = false): Participant => ({
  id,
  name: id,
  initials: id.slice(0, 2).toUpperCase(),
  accent: '#888888',
  isLocal: false,
  isMuted: muted,
  isSpeaking: speaking,
  volume: 100,
  locallyMuted: false,
  isBroadcasting: false,
});

describe('useSteadySpeaker', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance', 'Date'] });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  const setup = () =>
    renderHook(({ people }) => useSteadySpeaker(people), {
      initialProps: { people: [person('ana'), person('bia')] },
    });
  const advance = (ms: number) => act(() => void vi.advanceTimersByTime(ms));

  it('names the first speaker at once', () => {
    const view = setup();
    view.rerender({ people: [person('ana', true), person('bia')] });
    expect(view.result.current.speaker?.id).toBe('ana');
  });

  it('keeps one person on show while two trade words quickly', () => {
    const view = setup();
    view.rerender({ people: [person('ana', true), person('bia')] });
    // Six changes in 600 ms, all inside the time a person stays on show.
    for (let step = 0; step < 3; step += 1) {
      advance(100);
      view.rerender({ people: [person('ana'), person('bia', true)] });
      expect(view.result.current.speaker?.id).toBe('ana');
      advance(100);
      view.rerender({ people: [person('ana', true), person('bia')] });
      expect(view.result.current.speaker?.id).toBe('ana');
    }
  });

  it('hands over once the person on show has had their time', () => {
    const view = setup();
    view.rerender({ people: [person('ana', true), person('bia')] });
    view.rerender({ people: [person('ana'), person('bia', true)] });
    expect(view.result.current.speaker?.id).toBe('ana');
    advance(700);
    expect(view.result.current.speaker?.id).toBe('bia');
  });

  it('rides through a pause for breath, then stops saying speaking', () => {
    const view = setup();
    view.rerender({ people: [person('ana', true), person('bia')] });
    view.rerender({ people: [person('ana'), person('bia')] });
    advance(500);
    expect(view.result.current.speaker?.id).toBe('ana');
    view.rerender({ people: [person('ana', true), person('bia')] });
    view.rerender({ people: [person('ana'), person('bia')] });
    advance(900);
    expect(view.result.current.speaker).toBeUndefined();
    expect(view.result.current.last?.id).toBe('ana');
  });

  it('drops the label the moment the speaker mutes', () => {
    const view = setup();
    view.rerender({ people: [person('ana', true), person('bia')] });
    view.rerender({ people: [person('ana', true, true), person('bia')] });
    expect(view.result.current.speaker).toBeUndefined();
  });
});
