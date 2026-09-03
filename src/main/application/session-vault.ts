import { app, safeStorage } from 'electron';
import { readFile, writeFile, unlink } from 'node:fs/promises';
import path from 'node:path';

/** Windows DPAPI protects the session at rest; passwords never touch disk. */
export class SessionVault {
  private get file(): string {
    return path.join(app.getPath('userData'), 'account-session.bin');
  }
  async read(): Promise<string | null> {
    if (!safeStorage.isEncryptionAvailable()) return null;
    try {
      return safeStorage.decryptString(await readFile(this.file));
    } catch {
      return null;
    }
  }
  async save(token: string | null): Promise<boolean> {
    if (token === null) {
      await unlink(this.file).catch(() => {});
      return true;
    }
    if (typeof token !== 'string' || !/^[\w-]{43}$/.test(token)) throw new Error('Invalid session');
    if (!safeStorage.isEncryptionAvailable()) return false;
    await writeFile(this.file, safeStorage.encryptString(token), { mode: 0o600 });
    return true;
  }
}
