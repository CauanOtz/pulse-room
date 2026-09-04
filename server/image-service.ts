import { createHash } from 'node:crypto';
import type { Database } from './database.js';
import { HttpError } from './security.js';

export type ImageFormat = 'image/png' | 'image/webp';

export interface ImageFacts {
  mime: ImageFormat;
  width: number;
  height: number;
}

export const imageLimits = {
  bytes: 262_144,
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
 * a name, not a size. Only PNG and WebP are accepted, because both clients
 * re-encode before uploading and every other format is attack surface for no
 * gain. SVG is refused outright: it is a document that can carry script.
 *
 * The dimensions are read from the header rather than by decoding, so a small
 * file that claims to be enormous is turned away before any client is asked to
 * paint it.
 */
export function inspectImage(bytes: Buffer): ImageFacts {
  if (bytes.length < 32) reject('That image is not readable.');
  if (bytes.length > imageLimits.bytes) throw new HttpError(413, 'That image is too large.');

  const facts = readPng(bytes) ?? readWebp(bytes) ?? reject('Only PNG and WebP images are accepted.');

  if (!Number.isInteger(facts.width) || !Number.isInteger(facts.height)) reject('That image is not readable.');
  if (facts.width !== facts.height) throw new HttpError(422, 'The image must be square.');
  if (facts.width < imageLimits.minSide || facts.width > imageLimits.maxSide)
    throw new HttpError(422, `The image must be between ${imageLimits.minSide} and ${imageLimits.maxSide} pixels.`);
  return facts;
}

const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function readPng(bytes: Buffer): ImageFacts | undefined {
  if (!bytes.subarray(0, 8).equals(pngSignature)) return undefined;
  if (bytes.subarray(12, 16).toString('latin1') !== 'IHDR') reject('That PNG is not readable.');
  return { mime: 'image/png', width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
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
    };
  if (chunk === 'VP8L' && bytes.length >= 25 && bytes[20] === 0x2f) {
    const packed = bytes.readUInt32LE(21);
    return { mime: 'image/webp', width: (packed & 0x3fff) + 1, height: ((packed >> 14) & 0x3fff) + 1 };
  }
  if (chunk === 'VP8 ' && bytes.length >= 30 && bytes[23] === 0x9d && bytes[24] === 0x01 && bytes[25] === 0x2a)
    return {
      mime: 'image/webp',
      width: bytes.readUInt16LE(26) & 0x3fff,
      height: bytes.readUInt16LE(28) & 0x3fff,
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

  async store(bytes: Buffer, db: Database = this.db): Promise<string> {
    const facts = inspectImage(bytes);
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
         AND NOT EXISTS(SELECT 1 FROM accounts WHERE avatar_id=$1)
         AND NOT EXISTS(SELECT 1 FROM communities WHERE icon_id=$1)`,
      [id],
    );
  }

  /**
   * Reads a picture the viewer is entitled to see: their own, one belonging to
   * somebody they share a community with, or the icon of a community they are
   * in. An unguessable address is not on its own an access rule.
   */
  async read(viewerId: string, id: string): Promise<StoredImage> {
    const { rows } = await this.db.query<{ id: string; mime: ImageFormat; bytes: Buffer }>(
      `SELECT i.id, i.mime, i.bytes FROM images i
       WHERE i.id=$1 AND (
         EXISTS(SELECT 1 FROM accounts a WHERE a.avatar_id=i.id AND a.id=$2)
         OR EXISTS(
           SELECT 1 FROM accounts a
           JOIN memberships owner ON owner.account_id=a.id
           JOIN memberships viewer ON viewer.server_id=owner.server_id AND viewer.account_id=$2
           WHERE a.avatar_id=i.id)
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
