import { randomUUID } from 'node:crypto';
import type { Account, AccountSession } from '../src/shared/community.js';
import type { Database } from './database.js';
import { digest, HttpError, opaqueToken, PasswordHasher } from './security.js';

/** Only the part of the image store an account needs, to keep the two apart. */
export interface ImageOwner {
  collect(id: string | null | undefined, db?: Database): Promise<void>;
}

export interface AuthenticatedAccount extends Account {
  sessionId: string;
}
export class AccountService {
  private readonly passwords = new PasswordHasher();
  constructor(private readonly db: Database) {}

  async register(username: string, displayName: string, password: string): Promise<AccountSession> {
    const recoveryCode = opaqueToken();
    // Every path that returns an account describes it the same way.
    const user = { id: randomUUID(), username: username.toLowerCase(), displayName, avatarId: null };
    const hash = await this.passwords.hash(password);
    try {
      await this.db.query(
        'INSERT INTO accounts(id, username, display_name, password_hash, recovery_hash) VALUES($1,$2,$3,$4,$5)',
        [user.id, user.username, displayName, hash, digest(recoveryCode)],
      );
    } catch (error) {
      if ((error as { code?: string }).code === '23505')
        throw new HttpError(409, 'That username is already taken.');
      throw error;
    }
    return { ...(await this.createSession(user)), recoveryCode };
  }

  async login(username: string, password: string): Promise<AccountSession> {
    const {
      rows: [row],
    } = await this.db.query<Account & { passwordHash: string }>(
      `SELECT id, username, display_name AS "displayName", avatar_id AS "avatarId",
              password_hash AS "passwordHash" FROM accounts WHERE username=$1`,
      [username.toLowerCase()],
    );
    if (!(await this.passwords.verify(password, row?.passwordHash)) || !row)
      throw new HttpError(401, 'Username or password is incorrect.');
    // Lock the account so a concurrent password reset cannot leave a session
    // issued from a stale password hash valid after the reset.
    return this.db.transaction(async (db) => {
      const {
        rows: [current],
      } = await db.query<{ passwordHash: string }>(
        'SELECT password_hash AS "passwordHash" FROM accounts WHERE id=$1 FOR UPDATE',
        [row.id],
      );
      if (current.passwordHash !== row.passwordHash) throw new HttpError(401, 'Please sign in again.');
      return this.createSession(
        { id: row.id, username: row.username, displayName: row.displayName, avatarId: row.avatarId },
        db,
      );
    });
  }

  async authenticate(token?: string): Promise<AuthenticatedAccount> {
    if (!token || token.length > 256) throw new HttpError(401, 'Please sign in to continue.');
    const {
      rows: [account],
    } = await this.db.query<AuthenticatedAccount>(
      `
      SELECT a.id, a.username, a.display_name AS "displayName", a.avatar_id AS "avatarId", s.id AS "sessionId"
      FROM sessions s JOIN accounts a ON a.id=s.account_id
      WHERE s.token_hash=$1 AND s.expires_at > now()`,
      [digest(token)],
    );
    if (!account) throw new HttpError(401, 'Your session expired. Please sign in again.');
    return account;
  }

  async logout(sessionId: string): Promise<void> {
    await this.db.query('DELETE FROM sessions WHERE id=$1', [sessionId]);
  }

  async recover(username: string, recoveryCode: string, password: string): Promise<{ recoveryCode: string }> {
    const hash = await this.passwords.hash(password);
    const nextCode = opaqueToken();
    await this.db.transaction(async (db) => {
      const {
        rows: [account],
      } = await db.query<{ id: string }>(
        'UPDATE accounts SET password_hash=$1, recovery_hash=$2 WHERE username=$3 AND recovery_hash=$4 RETURNING id',
        [hash, digest(nextCode), username.toLowerCase(), digest(recoveryCode)],
      );
      if (!account) throw new HttpError(401, 'Username or recovery code is incorrect.');
      await db.query('DELETE FROM sessions WHERE account_id=$1', [account.id]);
    });
    return { recoveryCode: nextCode };
  }

  async changePassword(user: AuthenticatedAccount, currentPassword: string, password: string): Promise<void> {
    const {
      rows: [row],
    } = await this.db.query<{ password: string }>(
      'SELECT password_hash AS password FROM accounts WHERE id=$1',
      [user.id],
    );
    if (!(await this.passwords.verify(currentPassword, row.password)))
      throw new HttpError(401, 'Current password is incorrect.');
    const hash = await this.passwords.hash(password);
    await this.db.transaction(async (db) => {
      const result = await db.query(
        'UPDATE accounts SET password_hash=$1 WHERE id=$2 AND password_hash=$3 RETURNING id',
        [hash, user.id, row.password],
      );
      if (!result.rows.length) throw new HttpError(409, 'Password changed. Please sign in again.');
      await db.query('DELETE FROM sessions WHERE account_id=$1 AND id<>$2', [user.id, user.sessionId]);
    });
  }

  /** Swaps the picture and drops the previous one once nothing points at it. */
  async setAvatar(userId: string, imageId: string | null, images: ImageOwner): Promise<void> {
    await this.db.transaction(async (db) => {
      const {
        rows: [current],
      } = await db.query<{ avatarId: string | null }>(
        'SELECT avatar_id AS "avatarId" FROM accounts WHERE id=$1 FOR UPDATE',
        [userId],
      );
      await db.query('UPDATE accounts SET avatar_id=$2 WHERE id=$1', [userId, imageId]);
      if (current?.avatarId && current.avatarId !== imageId) await images.collect(current.avatarId, db);
    });
  }

  private async createSession(user: Account, db = this.db): Promise<AccountSession> {
    const token = opaqueToken();
    await db.query('DELETE FROM sessions WHERE expires_at <= now()');
    await db.query('INSERT INTO sessions(id, account_id, token_hash, expires_at) VALUES($1,$2,$3,$4)', [
      randomUUID(),
      user.id,
      digest(token),
      new Date(Date.now() + 30 * 86400_000),
    ]);
    return { token, user };
  }
}
