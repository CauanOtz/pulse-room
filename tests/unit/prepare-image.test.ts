import { describe, expect, it } from 'vitest';
import {
  checkCrop,
  minimumDelay,
  PictureError,
  preparePicture,
  sampleFrames,
  shapes,
  transparentIndex,
} from '../../src/renderer/infrastructure/prepare-image';

const everything = { x: 0, y: 0, width: 10, height: 10 };

describe('preparePicture', () => {
  it('refuses a document pretending to be a picture', async () => {
    await expect(preparePicture(new Blob(['<svg/>'], { type: 'image/svg+xml' }), everything, 'avatar')).rejects.toThrow(
      /PNG, JPEG, WebP or GIF/,
    );
    await expect(preparePicture(new Blob(['{}'], { type: 'application/json' }), everything, 'avatar')).rejects.toThrow(
      /PNG, JPEG, WebP or GIF/,
    );
  });

  it('refuses a file too large to be worth reading', async () => {
    const huge = new Blob([new Uint8Array(16 * 1024 * 1024)], { type: 'image/gif' });
    await expect(preparePicture(huge, everything, 'avatar')).rejects.toBeInstanceOf(PictureError);
  });
});

describe('the shapes a picture is prepared into', () => {
  it('matches what the service accepts, with room to spare', () => {
    // A face and an icon are squares; a banner is two and a half times wide.
    expect(shapes.avatar.aspect).toBe(1);
    expect(shapes.icon.aspect).toBe(1);
    expect(shapes.banner.aspect).toBe(2.5);
    for (const kind of ['avatar', 'icon', 'banner'] as const) {
      for (const size of [shapes[kind].still, shapes[kind].animated]) {
        expect(size.width / size.height).toBeCloseTo(shapes[kind].aspect, 5);
      }
    }
    // Under the service's own limits: 256 KB still, 5 MB animated face, 8 MB banner.
    expect(shapes.avatar.still.maxBytes).toBeLessThanOrEqual(262_144);
    expect(shapes.avatar.animated.maxBytes).toBeLessThan(5_242_880);
    expect(shapes.banner.animated.maxBytes).toBeLessThan(8_388_608);
    expect(shapes.banner.animated.maxFrames).toBeLessThan(400);
  });
});

describe('checkCrop', () => {
  it('accepts a frame inside the picture', () => {
    expect(() => checkCrop({ x: 10, y: 20, width: 100, height: 40 }, 200, 100)).not.toThrow();
  });

  it('forgives the rounding a drag leaves at the edge', () => {
    expect(() => checkCrop({ x: 100.005, y: 0, width: 100, height: 100 }, 200, 100)).not.toThrow();
  });

  it('refuses a frame that runs off the picture, or is not a frame at all', () => {
    for (const crop of [
      { x: -1, y: 0, width: 10, height: 10 },
      { x: 150, y: 0, width: 100, height: 10 },
      { x: 0, y: 0, width: 0, height: 10 },
      { x: 0, y: 0, width: Number.NaN, height: 10 },
    ]) {
      expect(() => checkCrop(crop, 200, 100)).toThrow(/outside/);
    }
  });
});

describe('sampleFrames', () => {
  it('keeps every frame of a short animation, at the time it asked for', () => {
    expect(sampleFrames([100, 50, 200], 10)).toEqual([
      { index: 0, duration: 100 },
      { index: 1, duration: 50 },
      { index: 2, duration: 200 },
    ]);
  });

  it('drops frames from a long one without making it play faster', () => {
    const durations = Array.from({ length: 300 }, () => 40);
    const kept = sampleFrames(durations, 100);
    expect(kept.length).toBeLessThanOrEqual(100);
    const total = (frames: { duration: number }[]) => frames.reduce((sum, frame) => sum + frame.duration, 0);
    expect(total(kept)).toBe(300 * 40);
    // Spread across the whole animation, not just its opening.
    expect(kept[kept.length - 1].index).toBeGreaterThan(290);
  });

  it('never writes a delay a browser would slow down', () => {
    // Anything under two hundredths of a second is played as a tenth.
    for (const frame of sampleFrames([0, 5, 10, 19], 10)) expect(frame.duration).toBeGreaterThanOrEqual(minimumDelay);
  });

  it('reads a frame that never said how long it lasts as lasting nothing, not forever', () => {
    expect(sampleFrames([Number.NaN, 100], 10).map((frame) => frame.duration)).toEqual([minimumDelay, 100]);
  });

  it('has nothing to say about an animation with no frames', () => {
    expect(sampleFrames([], 10)).toEqual([]);
  });
});

describe('transparentIndex', () => {
  it('finds the entry GIF will leave see-through', () => {
    expect(transparentIndex([[10, 10, 10, 255], [0, 0, 0, 0], [5, 5, 5, 255]])).toBe(1);
  });

  it('says so when a frame has no see-through colour at all', () => {
    expect(transparentIndex([[10, 10, 10, 255], [5, 5, 5]])).toBe(-1);
  });
});
