import { describe, expect, it } from 'vitest';
import { VoiceActivityLatch } from '../../src/renderer/infrastructure/media/audio-playback-engine';

describe('VoiceActivityLatch', () => {
  it('starts immediately when voice crosses the threshold', () => {
    const activity = new VoiceActivityLatch(0.01, 300);

    expect(activity.sample(0.002, 0)).toBe(false);
    expect(activity.sample(0.02, 80)).toBe(true);
  });

  it('holds the speaking state across pauses between words', () => {
    const activity = new VoiceActivityLatch(0.01, 300);

    expect(activity.sample(0.02, 0)).toBe(true);
    expect(activity.sample(0.001, 100)).toBe(true);
    expect(activity.sample(0.001, 350)).toBe(true);
    expect(activity.sample(0.001, 401)).toBe(false);
  });

  it('cancels the release when speech resumes', () => {
    const activity = new VoiceActivityLatch(0.01, 300);

    activity.sample(0.02, 0);
    activity.sample(0, 100);
    expect(activity.sample(0.02, 250)).toBe(true);
    expect(activity.sample(0, 500)).toBe(true);
  });
});
