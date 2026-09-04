import { crc32, deflateSync } from 'node:zlib';

const chunk = (tag: string, payload: Buffer): Buffer => {
  const body = Buffer.concat([Buffer.from(tag, 'latin1'), payload]);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(payload.length);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, checksum]);
};

/** A real, decodable PNG of one colour, used wherever a genuine image matters. */
export function png(size: number, red = 111, green = 143, blue = 255): Buffer {
  const raw = Buffer.alloc(size * (size * 3 + 1));
  for (let y = 0; y < size; y += 1) {
    const row = y * (size * 3 + 1);
    for (let x = 0; x < size; x += 1) {
      raw[row + 1 + x * 3] = red;
      raw[row + 2 + x * 3] = green;
      raw[row + 3 + x * 3] = blue;
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
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
