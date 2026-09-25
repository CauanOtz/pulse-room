import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { VoiceLevels } from '../../src/renderer/infrastructure/media/voice-levels';

/** Frames, driven by hand, so the easing can be watched a step at a time. */
function stubFrames() {
  const pending: FrameRequestCallback[] = [];
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    pending.push(callback);
    return pending.length;
  });
  vi.stubGlobal('cancelAnimationFrame', () => undefined);
  return {
    /** Runs whatever is waiting, once. */
    advance(times = 1) {
      for (let step = 0; step < times; step += 1) {
        const due = pending.splice(0, pending.length);
        due.forEach((callback) => callback(0));
      }
    },
    get queued() {
      return pending.length;
    },
  };
}

let frames: ReturnType<typeof stubFrames>;

beforeEach(() => {
  frames = stubFrames();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('VoiceLevels', () => {
  it('draws nothing until somebody is watching', () => {
    const levels = new VoiceLevels();

    levels.report('babi', 0.5);

    // A room nobody is looking at costs no frames at all.
    expect(frames.queued).toBe(0);
  });

  it('carries a reported level to whoever is drawing that person', () => {
    const levels = new VoiceLevels();
    const painted: number[] = [];
    levels.watch('babi', (level) => painted.push(level));
    levels.report('babi', 1);

    frames.advance(8);

    expect(painted.length).toBeGreaterThan(0);
    expect(painted[painted.length - 1]).toBeGreaterThan(0.9);
  });

  it('rises faster than it falls, which is how a voice reads', () => {
    const levels = new VoiceLevels();
    const painted: number[] = [];
    levels.watch('babi', (level) => painted.push(level));

    levels.report('babi', 1);
    frames.advance(1);
    const afterOneFrameUp = painted[painted.length - 1];

    levels.report('babi', 0);
    frames.advance(1);
    const fallenBy = afterOneFrameUp - painted[painted.length - 1];

    expect(afterOneFrameUp).toBeGreaterThan(fallenBy);
  });

  it('never draws a person nobody reported, and forgets one who left', () => {
    const levels = new VoiceLevels();
    const painted: number[] = [];
    levels.watch('ghost', (level) => painted.push(level));
    frames.advance(3);
    expect(painted.every((value) => value === 0)).toBe(true);

    levels.report('ghost', 1);
    frames.advance(6);
    levels.forget('ghost');
    frames.advance(40);

    expect(painted[painted.length - 1]).toBeLessThan(0.01);
  });

  it('stops asking for frames once the room has gone quiet', () => {
    const levels = new VoiceLevels();
    levels.watch('babi', () => undefined);
    levels.report('babi', 1);
    frames.advance(4);
    expect(frames.queued).toBeGreaterThan(0);

    levels.report('babi', 0);
    frames.advance(200);

    // This window spends its evenings behind a game; a silent room must not
    // keep an animation frame alive.
    expect(frames.queued).toBe(0);
  });

  it('stops entirely when the last watcher goes away', () => {
    const levels = new VoiceLevels();
    const stop = levels.watch('babi', () => undefined);
    levels.report('babi', 1);
    frames.advance(1);

    stop();
    frames.advance(1);

    expect(frames.queued).toBe(0);
  });
});
