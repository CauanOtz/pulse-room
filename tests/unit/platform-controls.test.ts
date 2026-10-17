// @vitest-environment node
import { createHash, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createServer } from '../../server/app';
import type { ServerConfiguration } from '../../server/config';
import type { AccountSession, Community, CommunityDetail } from '../../src/shared/community';
import { TestDatabase } from '../helpers/database';

const config: ServerConfiguration = {
  PORT: 3001,
  HOST: '127.0.0.1',
  APP_INVITE_SECRET: 'legacy-access-code',
  LIVEKIT_URL: 'wss://example.livekit.cloud',
  LIVEKIT_API_KEY: 'cloud-key',
  LIVEKIT_API_SECRET: 'cloud-secret',
  SELF_HOSTED_LIVEKIT_URL: 'wss://self-hosted.example.com',
  SELF_HOSTED_LIVEKIT_API_KEY: 'self-key',
  SELF_HOSTED_LIVEKIT_API_SECRET: 'self-secret',
};
const db = new TestDatabase();
let app: Awaited<ReturnType<typeof createServer>>;
let address = 1;
const password = 'A long test passphrase!';
const request = (method: 'GET' | 'POST', url: string, session?: AccountSession, payload?: unknown) =>
  app.inject({
    method,
    url,
    payload: payload as never,
    headers: {
      ...(session ? { authorization: `Bearer ${session.token}` } : {}),
      'x-forwarded-for': `10.9.${Math.floor(address / 200)}.${(++address % 200) + 1}`,
    },
  });
const register = (username: string, inviteCode?: string | null) =>
  request('POST', '/api/auth/register', undefined, {
    username,
    displayName: username,
    password,
    ...(inviteCode === undefined ? {} : { inviteCode }),
  });
const setting = (key: string, value: unknown) =>
  db.query(
    `INSERT INTO platform_settings (key, value) VALUES ($1, $2)
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
    [key, JSON.stringify(value)],
  );
const code = async (plain: string, maxUses = 1, expires: Date | null = null) =>
  db.query('INSERT INTO registration_codes (id, code_hash, max_uses, expires_at) VALUES ($1, $2, $3, $4)', [
    randomUUID(),
    createHash('sha256').update(plain.toUpperCase()).digest('hex'),
    maxUses,
    expires,
  ]);

beforeAll(async () => {
  app = await createServer(config, { read: async () => [] }, db);
});
afterAll(async () => {
  await app.close();
});
beforeEach(async () => {
  await db.query('DELETE FROM platform_settings');
});

describe('who may make an account', () => {
  it('lets anybody in while sign-ups are open, and says so', async () => {
    expect((await request('GET', '/api/auth/registration')).json()).toEqual({ mode: 'open' });
    expect((await register('openuser')).statusCode).toBe(200);
  });

  it('turns everybody away while sign-ups are closed', async () => {
    await setting('registration', { mode: 'closed' });
    expect((await request('GET', '/api/auth/registration')).json()).toEqual({ mode: 'closed' });
    const refused = await register('closeduser');
    expect(refused.statusCode).toBe(403);
    expect(refused.json().error).toMatch(/closed/);
  });

  it('asks for a code, spends it, and refuses it once it is used up or out of date', async () => {
    await setting('registration', { mode: 'invite' });
    await code('friends-of-merge', 1);
    await code('old-code', 5, new Date(Date.now() - 60_000));
    expect((await register('nocode')).statusCode).toBe(403);
    expect((await register('wrongcode', 'not-a-code')).statusCode).toBe(403);
    expect((await register('oldcode', 'old-code')).statusCode).toBe(403);
    expect((await register('withcode', ' friends-of-merge ')).statusCode).toBe(200);
    expect((await register('secondtry', 'friends-of-merge')).statusCode).toBe(403);
    const {
      rows: [row],
    } = await db.query<{ uses: number }>('SELECT uses FROM registration_codes WHERE max_uses = 1');
    expect(row!.uses).toBe(1);
  });

  it('does not spend a code on an account that could not be made', async () => {
    await setting('registration', { mode: 'invite' });
    await code('two-uses', 2);
    expect((await register('dupe', 'two-uses')).statusCode).toBe(200);
    expect((await register('dupe', 'two-uses')).statusCode).toBe(409);
    const {
      rows: [row],
    } = await db.query<{ uses: number }>('SELECT uses FROM registration_codes WHERE max_uses = 2');
    expect(row!.uses).toBe(1);
  });

  it('treats a setting it does not know as open, rather than locking everybody out', async () => {
    await setting('registration', { mode: 'sometimes' });
    expect((await request('GET', '/api/auth/registration')).json()).toEqual({ mode: 'open' });
  });
});

describe('a suspended account', () => {
  it('cannot sign in, and the sessions it had stop working', async () => {
    const session = (await register('suspendme')).json() as AccountSession;
    expect((await request('GET', '/api/auth/me', session)).statusCode).toBe(200);
    await db.query(
      "UPDATE accounts SET suspended_at = now(), suspended_reason = 'afk' WHERE username = 'suspendme'",
    );

    expect((await request('GET', '/api/auth/me', session)).statusCode).toBe(401);
    const wrong = await request('POST', '/api/auth/login', undefined, {
      username: 'suspendme',
      password: 'wrong password!',
    });
    expect(wrong.json().error).toBe('Username or password is incorrect.');
    const right = await request('POST', '/api/auth/login', undefined, { username: 'suspendme', password });
    expect(right.statusCode).toBe(403);
    expect(right.json().error).toBe('This account is suspended.');

    await db.query("UPDATE accounts SET suspended_at = NULL WHERE username = 'suspendme'");
    expect(
      (await request('POST', '/api/auth/login', undefined, { username: 'suspendme', password })).statusCode,
    ).toBe(200);
  });
});

describe('how good a shared screen may be', () => {
  it('comes with the call token, and is nothing until it is set', async () => {
    const owner = (await register('screenowner')).json() as AccountSession;
    const server = (await request('POST', '/api/servers', owner, { name: 'Telas' })).json() as Community;
    const detail = (await request('GET', `/api/servers/${server.id}`, owner)).json() as CommunityDetail;
    const voice = detail.channels.find((channel) => channel.type === 'voice')!;

    expect((await request('POST', `/api/rooms/${voice.id}/token`, owner, {})).json().limits).toEqual({
      screenShare: null,
    });
    await setting('screenShare', { maxPreset: 'efficient' });
    expect((await request('POST', `/api/rooms/${voice.id}/token`, owner, {})).json().limits).toEqual({
      screenShare: 'efficient',
    });
  });
});

describe('which app and version each session uses', () => {
  const sessionOf = async (username: string) =>
    (
      await db.query<{ client: string | null; client_version: string | null; last_seen_at: Date | null }>(
        `SELECT s.client, s.client_version, s.last_seen_at FROM sessions s JOIN accounts a ON a.id = s.account_id
        WHERE a.username = $1 ORDER BY s.expires_at DESC LIMIT 1`,
        [username],
      )
    ).rows[0]!;
  const me = (session: AccountSession, headers: Record<string, string>) =>
    app.inject({
      method: 'GET',
      url: '/api/auth/me',
      headers: {
        authorization: `Bearer ${session.token}`,
        'x-forwarded-for': `10.8.0.${++address % 250}`,
        ...headers,
      },
    });

  it('reads a desktop version from the user agent Electron sends, even from apps that never said', async () => {
    const session = (await register('olddesktop')).json() as AccountSession;
    await me(session, {
      'user-agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) PulseRoom/0.11.1 Chrome/152.0 Electron/44.1.1 Safari/537.36',
    });
    expect(await sessionOf('olddesktop')).toMatchObject({ client: 'desktop', client_version: '0.11.1' });
  });

  it('takes the app’s own word first, and keeps up when it updates', async () => {
    const session = (await register('phoneuser')).json() as AccountSession;
    await me(session, { 'x-pulse-client': 'android/0.13.0', 'user-agent': 'okhttp/4.12.0' });
    expect(await sessionOf('phoneuser')).toMatchObject({ client: 'android', client_version: '0.13.0' });
    await me(session, { 'x-pulse-client': 'android/0.14.0' });
    expect(await sessionOf('phoneuser')).toMatchObject({ client: 'android', client_version: '0.14.0' });
  });

  it('notes when a session was last seen, but records no app for a browser or a script', async () => {
    const session = (await register('browseruser')).json() as AccountSession;
    await me(session, { 'user-agent': 'Mozilla/5.0 Chrome/150', 'x-pulse-client': 'evil/9.9.9; DROP TABLE' });
    const seen = await sessionOf('browseruser');
    expect(seen).toMatchObject({ client: null, client_version: null });
    expect(seen.last_seen_at).toBeInstanceOf(Date);
  });
});
