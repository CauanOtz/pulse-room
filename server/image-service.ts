import { createHash } from 'node:crypto';
import type { Database } from './database.js';
import { HttpError } from './security.js';

export type ImageFormat = 'image/png' | 'image/webp' | 'image/gif';

export interface ImageFacts {
  mime: ImageFormat;
  width: number;
  height: number;
  /** Only ever more than one for a GIF. */
  frames: number;
}

/**
 * What a picture is for decides the shape it must have. A face or a server
 * icon is a square; a banner is a wide strip across the top of a card.
 */
export type ImageKind = 'avatar' | 'icon' | 'banner';

interface KindRules {
  square: boolean;
  minWidth: number;
  maxWidth: number;
  minHeight: number;
  maxHeight: number;
  /** A banner is wide: between twice and three times as wide as it is tall. */
  minAspect?: number;
  maxAspect?: number;
  /** A still picture stays small; an animation is allowed room to move. */
  stillBytes: number;
  animatedBytes: number;
}

const kinds: Record<ImageKind, KindRules> = {
  avatar: {
    square: true,
    minWidth: 16,
    maxWidth: 1024,
    minHeight: 16,
    maxHeight: 1024,
    stillBytes: 262_144,
    animatedBytes: 5_242_880,
  },
  icon: {
    square: true,
    minWidth: 16,
    maxWidth: 1024,
    minHeight: 16,
    maxHeight: 1024,
    stillBytes: 262_144,
    animatedBytes: 5_242_880,
  },
  banner: {
    square: false,
    minWidth: 300,
    maxWidth: 1500,
    minHeight: 100,
    maxHeight: 600,
    minAspect: 2,
    maxAspect: 3,
    stillBytes: 1_048_576,
    animatedBytes: 8_388_608,
  },
};

/** An animation longer than this is a video, and should not be a profile. */
export const maxFrames = 400;

export const imageLimits = {
  /** The largest body any upload route will read at all. */
  bytes: Math.max(...Object.values(kinds).map((rules) => Math.max(rules.stillBytes, rules.animatedBytes))),
  minSide: 16,
  maxSide: 1024,
} as const;

const reject = (reason: string): never => {
  throw new HttpError(415, reason);
};

/**
 * Establishes what an upload really is, from its own bytes.
 *
 * Nothing the client says about the file is trusted: not the content type, not
 * a name, not a size. PNG, WebP and GIF are accepted, because the desktop
 * client re-encodes into one of them before uploading and every other format
 * is attack surface for no gain. SVG is refused outright: it is a document
 * that can carry script.
 *
 * No image decoder runs here. The dimensions are read from the header, and a
 * GIF is checked by walking its block structure without ever decompressing a
 * frame, so a small file that claims to be enormous, or an animation that
 * would run for an hour, is turned away before any client is asked to paint it.
 */
export function inspectImage(bytes: Buffer, kind: ImageKind = 'avatar'): ImageFacts {
  const rules = kinds[kind];
  if (bytes.length < 32) reject('That image is not readable.');
  if (bytes.length > Math.max(rules.stillBytes, rules.animatedBytes))
    throw new HttpError(413, 'That image is too large.');

  const facts =
    readPng(bytes) ?? readWebp(bytes) ?? readGif(bytes) ?? reject('Only PNG, WebP and GIF images are accepted.');

  const limit = facts.mime === 'image/gif' ? rules.animatedBytes : rules.stillBytes;
  if (bytes.length > limit) throw new HttpError(413, 'That image is too large.');
  if (!Number.isInteger(facts.width) || !Number.isInteger(facts.height)) reject('That image is not readable.');

  if (rules.square) {
    if (facts.width !== facts.height) throw new HttpError(422, 'The image must be square.');
    if (facts.width < rules.minWidth || facts.width > rules.maxWidth)
      throw new HttpError(422, `The image must be between ${rules.minWidth} and ${rules.maxWidth} pixels.`);
    return facts;
  }

  if (
    facts.width < rules.minWidth ||
    facts.width > rules.maxWidth ||
    facts.height < rules.minHeight ||
    facts.height > rules.maxHeight
  )
    throw new HttpError(
      422,
      `A banner must be between ${rules.minWidth}×${rules.minHeight} and ${rules.maxWidth}×${rules.maxHeight} pixels.`,
    );
  const aspect = facts.width / facts.height;
  if ((rules.minAspect && aspect < rules.minAspect) || (rules.maxAspect && aspect > rules.maxAspect))
    throw new HttpError(422, 'A banner must be about two and a half times as wide as it is tall.');
  return facts;
}

/**
 * Reads a GIF's structure without decoding it.
 *
 * Every block announces its own length, so the file can be walked from the
 * header to the trailer by skipping over data rather than decompressing it.
 * That is enough to know its size, how many frames it holds, and that each
 * frame lies inside the picture it claims to belong to. Anything that runs off
 * the end, or a block that is not one GIF defines, is refused.
 */
function readGif(bytes: Buffer): ImageFacts | undefined {
  const signature = bytes.subarray(0, 6).toString('latin1');
  if (signature !== 'GIF87a' && signature !== 'GIF89a') return undefined;

  const width = bytes.readUInt16LE(6);
  const height = bytes.readUInt16LE(8);
  const packed = bytes[10];
  let at = 13;
  if (packed & 0x80) at += 3 * 2 ** ((packed & 0x07) + 1);

  const need = (count: number) => {
    if (at + count > bytes.length) reject('That GIF is truncated.');
  };
  // A run of sub-blocks, each prefixed with its own length, ending at zero.
  const skipSubBlocks = () => {
    for (;;) {
      need(1);
      const size = bytes[at];
      at += 1;
      if (size === 0) return;
      need(size);
      at += size;
    }
  };

  let frames = 0;
  for (;;) {
    need(1);
    const block = bytes[at];
    at += 1;
    if (block === 0x3b) break; // trailer
    if (block === 0x21) {
      need(1);
      at += 1; // the extension's label
      skipSubBlocks();
      continue;
    }
    if (block !== 0x2c) reject('That GIF is not readable.');

    need(9);
    const left = bytes.readUInt16LE(at);
    const top = bytes.readUInt16LE(at + 2);
    const frameWidth = bytes.readUInt16LE(at + 4);
    const frameHeight = bytes.readUInt16LE(at + 6);
    const framePacked = bytes[at + 8];
    at += 9;
    if (frameWidth === 0 || frameHeight === 0 || left + frameWidth > width || top + frameHeight > height)
      reject('That GIF has a frame outside its own picture.');
    if (framePacked & 0x80) {
      const table = 3 * 2 ** ((framePacked & 0x07) + 1);
      need(table);
      at += table;
    }
    need(1);
    at += 1; // minimum code size
    skipSubBlocks();
    frames += 1;
    if (frames > maxFrames) throw new HttpError(422, `An animation can have at most ${maxFrames} frames.`);
  }

  if (frames === 0) reject('That GIF has no picture in it.');
  return { mime: 'image/gif', width, height, frames };
}

const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function readPng(bytes: Buffer): ImageFacts | undefined {
  if (!bytes.subarray(0, 8).equals(pngSignature)) return undefined;
  if (bytes.subarray(12, 16).toString('latin1') !== 'IHDR') reject('That PNG is not readable.');
  return { mime: 'image/png', width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20), frames: 1 };
}

function readWebp(bytes: Buffer): ImageFacts | undefined {
  if (bytes.subarray(0, 4).toString('latin1') !== 'RIFF') return undefined;
  if (bytes.subarray(8, 12).toString('latin1') !== 'WEBP') reject('That WebP is not readable.');
  // The declared payload must fit what actually arrived.
  if (bytes.readUInt32LE(4) + 8 > bytes.length) reject('That WebP is truncated.');

  const chunk = bytes.subarray(12, 16).toString('latin1');
  if (chunk === 'VP8X' && bytes.length >= 30)
    return {
      mime: 'image/webp',
      width: bytes.readUIntLE(24, 3) + 1,
      height: bytes.readUIntLE(27, 3) + 1,
      frames: 1,
    };
  if (chunk === 'VP8L' && bytes.length >= 25 && bytes[20] === 0x2f) {
    const packed = bytes.readUInt32LE(21);
    return { mime: 'image/webp', width: (packed & 0x3fff) + 1, height: ((packed >> 14) & 0x3fff) + 1, frames: 1 };
  }
  if (chunk === 'VP8 ' && bytes.length >= 30 && bytes[23] === 0x9d && bytes[24] === 0x01 && bytes[25] === 0x2a)
    return {
      mime: 'image/webp',
      width: bytes.readUInt16LE(26) & 0x3fff,
      height: bytes.readUInt16LE(28) & 0x3fff,
      frames: 1,
    };
  return reject('That WebP is not readable.');
}

export interface StoredImage {
  id: string;
  mime: ImageFormat;
  bytes: Buffer;
}

/**
 * Keeps pictures in the database, addressed by the hash of their content.
 *
 * A content address means the same picture is stored once, and that a stored
 * picture can never change under an address that somebody already cached.
 */
export class ImageService {
  constructor(private readonly db: Database) {}

  async store(bytes: Buffer, kind: ImageKind = 'avatar', db: Database = this.db): Promise<string> {
    const facts = inspectImage(bytes, kind);
    const id = createHash('sha256').update(bytes).digest('hex');
    await db.query(
      `INSERT INTO images(id,mime,width,height,bytes) VALUES($1,$2,$3,$4,$5)
       ON CONFLICT (id) DO NOTHING`,
      [id, facts.mime, facts.width, facts.height, bytes],
    );
    return id;
  }

  /** Removes a picture once nothing points at it any more. */
  async collect(id: string | null | undefined, db: Database = this.db): Promise<void> {
    if (!id) return;
    await db.query(
      `DELETE FROM images WHERE id=$1
         AND NOT EXISTS(SELECT 1 FROM accounts WHERE avatar_id=$1 OR banner_id=$1)
         AND NOT EXISTS(SELECT 1 FROM communities WHERE icon_id=$1)`,
      [id],
    );
  }

  /**
   * Reads a picture the viewer is entitled to see: their own face or banner,
   * one belonging to somebody they share a community with, or the icon of a
   * community they are in. An unguessable address is not on its own an access
   * rule, and a banner is no more public than a face.
   */
  async read(viewerId: string, id: string): Promise<StoredImage> {
    const { rows } = await this.db.query<{ id: string; mime: ImageFormat; bytes: Buffer }>(
      `SELECT i.id, i.mime, i.bytes FROM images i
       WHERE i.id=$1 AND (
         EXISTS(SELECT 1 FROM accounts a WHERE (a.avatar_id=i.id OR a.banner_id=i.id) AND a.id=$2)
         OR EXISTS(
           SELECT 1 FROM accounts a
           JOIN memberships owner ON owner.account_id=a.id
           JOIN memberships viewer ON viewer.server_id=owner.server_id AND viewer.account_id=$2
           WHERE a.avatar_id=i.id OR a.banner_id=i.id)
         OR EXISTS(
           SELECT 1 FROM communities c
           JOIN memberships viewer ON viewer.server_id=c.id AND viewer.account_id=$2
           WHERE c.icon_id=i.id))`,
      [id, viewerId],
    );
    const image = rows[0];
    if (!image) throw new HttpError(404, 'That image is not available.');
    return image;
  }
}
