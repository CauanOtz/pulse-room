// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { imageLimits, inspectImage } from '../../server/image-service';
import { gif, jpeg, png, svg, webp } from '../helpers/images';

describe('inspectImage', () => {
  it('reads a PNG from its own bytes', () => {
    expect(inspectImage(png(64))).toEqual({ mime: 'image/png', width: 64, height: 64 });
  });

  it('reads a lossless WebP', () => {
    expect(inspectImage(webp(256, 256))).toEqual({ mime: 'image/webp', width: 256, height: 256 });
  });

  it('refuses SVG, which is a document that can carry script', () => {
    expect(() => inspectImage(svg)).toThrow(/PNG and WebP/);
  });

  it('refuses every other format', () => {
    expect(() => inspectImage(gif)).toThrow(/PNG and WebP/);
    expect(() => inspectImage(jpeg)).toThrow(/PNG and WebP/);
  });

  it('ignores what the upload claims and trusts the signature', () => {
    const disguised = Buffer.concat([svg, Buffer.alloc(64)]);
    expect(() => inspectImage(disguised)).toThrow(/PNG and WebP/);
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

  it('refuses more bytes than an avatar can justify', () => {
    expect(() => inspectImage(Buffer.concat([png(64), Buffer.alloc(imageLimits.bytes)]))).toThrow(/too large/);
  });

  it('refuses a truncated file rather than reading past its end', () => {
    expect(() => inspectImage(png(64).subarray(0, 20))).toThrow();
    const lying = webp(64, 64);
    lying.writeUInt32LE(9_000, 4);
    expect(() => inspectImage(lying)).toThrow(/truncated/);
  });
});
