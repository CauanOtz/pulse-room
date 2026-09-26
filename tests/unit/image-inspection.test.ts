// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { imageLimits, inspectImage, maxFrames } from '../../server/image-service';
import { animatedGif, gif, jpeg, paddedGif, png, svg, webp } from '../helpers/images';

describe('inspectImage', () => {
  it('reads a PNG from its own bytes', () => {
    expect(inspectImage(png(64))).toEqual({ mime: 'image/png', width: 64, height: 64, frames: 1 });
  });

  it('reads a lossless WebP', () => {
    expect(inspectImage(webp(256, 256))).toEqual({ mime: 'image/webp', width: 256, height: 256, frames: 1 });
  });

  it('refuses SVG, which is a document that can carry script', () => {
    expect(() => inspectImage(svg)).toThrow(/PNG, WebP and GIF/);
  });

  it('refuses every format no client produces', () => {
    expect(() => inspectImage(jpeg)).toThrow(/PNG, WebP and GIF/);
  });

  it('ignores what the upload claims and trusts the signature', () => {
    const disguised = Buffer.concat([svg, Buffer.alloc(64)]);
    expect(() => inspectImage(disguised)).toThrow(/PNG, WebP and GIF/);
  });

  it('turns away a picture too large to paint', () => {
    expect(() => inspectImage(png(64).fill(0x00, 16, 24))).toThrow();
    const enormous = png(64);
    enormous.writeUInt32BE(20_000, 16);
    enormous.writeUInt32BE(20_000, 20);
    expect(() => inspectImage(enormous)).toThrow(/pixels/);
  });

  it('turns away a picture too small to be a face', () => {
    const tiny = png(64);
    tiny.writeUInt32BE(8, 16);
    tiny.writeUInt32BE(8, 20);
    expect(() => inspectImage(tiny)).toThrow(/pixels/);
  });

  it('wants a square, because every avatar is drawn as one', () => {
    const wide = png(64);
    wide.writeUInt32BE(128, 16);
    expect(() => inspectImage(wide)).toThrow(/square/);
  });

  it('refuses more bytes than any picture can justify', () => {
    expect(() => inspectImage(Buffer.concat([png(64), Buffer.alloc(imageLimits.bytes)]))).toThrow(/too large/);
  });

  it('keeps a still face small, even though an animated one may be larger', () => {
    const heavy = Buffer.concat([png(64), Buffer.alloc(300_000)]);
    expect(() => inspectImage(heavy, 'avatar')).toThrow(/too large/);
  });

  it('refuses a truncated file rather than reading past its end', () => {
    expect(() => inspectImage(png(64).subarray(0, 20))).toThrow();
    const lying = webp(64, 64);
    lying.writeUInt32LE(9_000, 4);
    expect(() => inspectImage(lying)).toThrow(/truncated/);
  });
});

describe('inspectImage, animated', () => {
  it('reads an animated GIF and counts its frames without decoding them', () => {
    expect(inspectImage(animatedGif(64, 64, 6))).toEqual({ mime: 'image/gif', width: 64, height: 64, frames: 6 });
  });

  it('takes a single-frame GIF as a still picture', () => {
    expect(inspectImage(animatedGif(48, 48, 1)).frames).toBe(1);
  });

  it('refuses a GIF whose body is not GIF at all', () => {
    // Right signature, then noise: it claims a colour table it never provides.
    expect(() => inspectImage(gif)).toThrow(/GIF/);
  });

  it('refuses a GIF cut short in the middle of a frame', () => {
    const whole = animatedGif(64, 64, 3);
    expect(() => inspectImage(whole.subarray(0, Math.floor(whole.length * 0.6)))).toThrow(/truncated/);
  });

  it('refuses a GIF that never says it has ended', () => {
    const whole = animatedGif(64, 64, 2);
    expect(() => inspectImage(whole.subarray(0, whole.length - 1))).toThrow(/truncated/);
  });

  it('refuses a frame drawn outside the picture it belongs to', () => {
    const whole = animatedGif(64, 64, 2);
    // Shrink the declared picture under the frames already written into it.
    whole.writeUInt16LE(32, 6);
    whole.writeUInt16LE(32, 8);
    expect(() => inspectImage(whole)).toThrow(/outside/);
  });

  it('refuses a block that no GIF defines', () => {
    const whole = animatedGif(64, 64, 1);
    const tampered = Buffer.concat([whole.subarray(0, whole.length - 1), Buffer.from([0x99, 0x3b])]);
    expect(() => inspectImage(tampered)).toThrow(/not readable/);
  });

  it('refuses an animation long enough to be a video', () => {
    expect(() => inspectImage(animatedGif(16, 16, maxFrames + 1))).toThrow(/frames/);
  }, 20_000);

  it('allows an animated face room a still one does not get', () => {
    const moving = paddedGif(animatedGif(64, 64, 4), 600_000);
    expect(moving.length).toBeGreaterThan(262_144);
    expect(inspectImage(moving, 'avatar').frames).toBe(4);
  });

  it('still draws a line under an animated face', () => {
    const endless = paddedGif(animatedGif(64, 64, 2), 5_300_000);
    expect(() => inspectImage(endless, 'avatar')).toThrow(/too large/);
  });
});

describe('inspectImage, banners', () => {
  it('takes a wide strip as a banner', () => {
    expect(inspectImage(png(600, 10, 20, 30, 240), 'banner')).toMatchObject({ width: 600, height: 240 });
  });

  it('takes an animated banner', () => {
    expect(inspectImage(animatedGif(600, 240, 3), 'banner')).toMatchObject({ mime: 'image/gif', frames: 3 });
  });

  it('refuses a square as a banner, and a banner as a face', () => {
    expect(() => inspectImage(png(300), 'banner')).toThrow(/wide/);
    expect(() => inspectImage(png(600, 1, 1, 1, 240), 'avatar')).toThrow(/square/);
  });

  it('refuses a strip too thin or too small to read', () => {
    expect(() => inspectImage(png(1200, 1, 1, 1, 240), 'banner')).toThrow(/wide/);
    expect(() => inspectImage(png(200, 1, 1, 1, 80), 'banner')).toThrow(/between/);
  });
});
