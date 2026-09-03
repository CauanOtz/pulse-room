import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

export class HttpError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
  ) {
    super(message);
  }
}
export const opaqueToken = (): string => randomBytes(32).toString('base64url');
export const digest = (value: string): string => createHash('sha256').update(value).digest('hex');

/** OWASP scrypt profile: 32 MiB, r=8, p=3. Limit simultaneous expensive work. */
export class PasswordHasher {
  private active = 0;
  private async derive(password: string, salt: string): Promise<Buffer> {
    if (this.active >= 2) throw new HttpError(429, 'Too many sign-in attempts. Try again shortly.');
    this.active++;
    try {
      return await new Promise<Buffer>((resolve, reject) =>
        scrypt(password, salt, 64, { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 }, (error, value) =>
          error ? reject(error) : resolve(value),
        ),
      );
    } finally {
      this.active--;
    }
  }
  async hash(password: string): Promise<string> {
    const salt = randomBytes(16).toString('hex');
    return `scrypt-v1$${salt}$${(await this.derive(password, salt)).toString('hex')}`;
  }
  async verify(password: string, encoded?: string): Promise<boolean> {
    const [, salt, hash] = (encoded ?? '').split('$');
    const actual = await this.derive(password, salt || 'missing-account-timing-padding');
    const expected = hash ? Buffer.from(hash, 'hex') : Buffer.alloc(64);
    return actual.length === expected.length && timingSafeEqual(actual, expected) && Boolean(encoded);
  }
}
