import { crc32, deflateSync } from 'node:zlib';
import { GIFEncoder, applyPalette, quantize } from 'gifenc';

const chunk = (tag: string, payload: Buffer): Buffer => {
  const body = Buffer.concat([Buffer.from(tag, 'latin1'), payload]);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(payload.length);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, checksum]);
};

/** A real, decodable PNG of one colour, used wherever a genuine image matters. */
export function png(size: number, red = 111, green = 143, blue = 255, height = size): Buffer {
  const width = size;
  const raw = Buffer.alloc(height * (width * 3 + 1));
  for (let y = 0; y < height; y += 1) {
    const row = y * (width * 3 + 1);
    for (let x = 0; x < width; x += 1) {
      raw[row + 1 + x * 3] = red;
      raw[row + 2 + x * 3] = green;
      raw[row + 3 + x * 3] = blue;
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // bit depth
  header[9] = 2; // truecolour
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** A WebP whose header is what the service reads, padded to a plausible size. */
export function webp(width: number, height: number, payloadBytes = 64): Buffer {
  const bitstream = Buffer.alloc(payloadBytes);
  bitstream[0] = 0x2f;
  bitstream.writeUInt32LE((((height - 1) << 14) | (width - 1)) >>> 0, 1);
  const chunkSize = Buffer.alloc(4);
  chunkSize.writeUInt32LE(bitstream.length);
  const body = Buffer.concat([
    Buffer.from('WEBP', 'latin1'),
    Buffer.from('VP8L', 'latin1'),
    chunkSize,
    bitstream,
  ]);
  const riffSize = Buffer.alloc(4);
  riffSize.writeUInt32LE(body.length);
  return Buffer.concat([Buffer.from('RIFF', 'latin1'), riffSize, body]);
}

export const svg = Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"><script>alert(1)</script></svg>',
);
export const gif = Buffer.concat([Buffer.from('GIF89a', 'latin1'), Buffer.alloc(64, 7)]);
export const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(64, 3)]);

/**
 * A real, decodable animated GIF, one solid colour per frame, written by the
 * same encoder the desktop client uses.
 */
export function animatedGif(width: number, height: number, frames: number): Buffer {
  const encoder = GIFEncoder();
  for (let frame = 0; frame < frames; frame += 1) {
    const rgba = new Uint8Array(width * height * 4);
    for (let pixel = 0; pixel < width * height; pixel += 1) {
      rgba[pixel * 4] = (frame * 67) % 256;
      rgba[pixel * 4 + 1] = (frame * 131) % 256;
      rgba[pixel * 4 + 2] = (frame * 29) % 256;
      rgba[pixel * 4 + 3] = 255;
    }
    const palette = quantize(rgba, 16);
    encoder.writeFrame(applyPalette(rgba, palette), width, height, { palette, delay: 80 });
  }
  encoder.finish();
  return Buffer.from(encoder.bytes());
}

/**
 * The same GIF made larger without changing a single pixel: a comment
 * extension is legal anywhere between frames and is skipped by every reader.
 */
export function paddedGif(source: Buffer, extraBytes: number): Buffer {
  const blocks: Buffer[] = [Buffer.from([0x21, 0xfe])];
  for (let left = extraBytes; left > 0; left -= 255) {
    const size = Math.min(255, left);
    blocks.push(Buffer.from([size]), Buffer.alloc(size, 0x2e));
  }
  blocks.push(Buffer.from([0x00]));
  // Everything up to the trailer, the comment, then the trailer again.
  return Buffer.concat([source.subarray(0, source.length - 1), ...blocks, source.subarray(source.length - 1)]);
}
