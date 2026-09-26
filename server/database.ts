import pg from 'pg';

export interface SqlResult<T> {
  rows: T[];
}
export interface Database {
  query<T = Record<string, unknown>>(sql: string, values?: unknown[]): Promise<SqlResult<T>>;
  transaction<T>(action: (database: Database) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

/** A bounded pool, with a connection-scoped unit of work for atomic writes. */
export class PostgresDatabase implements Database {
  private readonly pool: pg.Pool;
  constructor(connectionString: string) {
    this.pool = new pg.Pool({
      connectionString,
      max: 5,
      connectionTimeoutMillis: 10_000,
      idleTimeoutMillis: 30_000,
      statement_timeout: 15_000,
    });
  }
  async query<T>(sql: string, values?: unknown[]): Promise<SqlResult<T>> {
    return this.pool.query(sql, values) as unknown as Promise<SqlResult<T>>;
  }
  async transaction<T>(action: (database: Database) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const scoped: Database = {
        query: (sql, values) => client.query(sql, values) as never,
        transaction: () => {
          throw new Error('Nested transactions are not supported');
        },
        close: async () => {},
      };
      const result = await action(scoped);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
  async close(): Promise<void> {
    await this.pool.end();
  }
}

export async function migrate(database: Database): Promise<void> {
  await database.transaction(async (db) => {
    // Serializes cold starts / overlapping rolling deployments.
    await db.query('SELECT pg_advisory_xact_lock(746219)');
    await db.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (version integer PRIMARY KEY);
      CREATE TABLE IF NOT EXISTS accounts (
        id uuid PRIMARY KEY, username text UNIQUE NOT NULL,
        display_name text NOT NULL, password_hash text NOT NULL,
        recovery_hash text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE TABLE IF NOT EXISTS sessions (
        id uuid PRIMARY KEY, account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
        token_hash text UNIQUE NOT NULL, expires_at timestamptz NOT NULL
      );
      CREATE INDEX IF NOT EXISTS sessions_account_idx ON sessions(account_id);
      CREATE TABLE IF NOT EXISTS communities (
        id uuid PRIMARY KEY, name text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE TABLE IF NOT EXISTS memberships (
        server_id uuid NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
        account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
        role text NOT NULL CHECK (role IN ('owner','admin','member')),
        PRIMARY KEY(server_id, account_id)
      );
      CREATE INDEX IF NOT EXISTS memberships_account_idx ON memberships(account_id);
      CREATE UNIQUE INDEX IF NOT EXISTS one_owner_idx ON memberships(server_id) WHERE role = 'owner';
      CREATE TABLE IF NOT EXISTS channels (
        id uuid PRIMARY KEY, server_id uuid NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
        name text NOT NULL, type text NOT NULL CHECK (type IN ('text','voice')),
        private boolean NOT NULL DEFAULT false, allow_speak boolean NOT NULL DEFAULT true,
        allow_share boolean NOT NULL DEFAULT true, read_only boolean NOT NULL DEFAULT false,
        created_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS channels_server_idx ON channels(server_id);
      CREATE TABLE IF NOT EXISTS channel_members (
        channel_id uuid NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
        account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
        PRIMARY KEY(channel_id, account_id)
      );
      CREATE TABLE IF NOT EXISTS invitations (
        id uuid PRIMARY KEY, server_id uuid NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
        code_hash text UNIQUE NOT NULL, expires_at timestamptz NOT NULL,
        max_uses integer NOT NULL CHECK (max_uses > 0), uses integer NOT NULL DEFAULT 0,
        revoked boolean NOT NULL DEFAULT false
      );
      CREATE TABLE IF NOT EXISTS messages (
        id uuid PRIMARY KEY, channel_id uuid NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
        author_id uuid NOT NULL REFERENCES accounts(id), content text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS messages_channel_idx ON messages(channel_id, created_at DESC, id DESC);
      INSERT INTO schema_migrations(version) VALUES(1) ON CONFLICT DO NOTHING;
    `);
    // Pictures are addressed by the hash of their content, so a stored picture
    // can never change under an address somebody already cached.
    await db.query(`
      CREATE TABLE IF NOT EXISTS images (
        id text PRIMARY KEY CHECK (id ~ '^[0-9a-f]{64}$'),
        mime text NOT NULL CHECK (mime IN ('image/png','image/webp')),
        width integer NOT NULL CHECK (width BETWEEN 16 AND 1024),
        height integer NOT NULL CHECK (height BETWEEN 16 AND 1024),
        bytes bytea NOT NULL CHECK (octet_length(bytes) BETWEEN 32 AND 262144),
        created_at timestamptz NOT NULL DEFAULT now()
      );
      ALTER TABLE accounts ADD COLUMN IF NOT EXISTS avatar_id text REFERENCES images(id) ON DELETE SET NULL;
      ALTER TABLE communities ADD COLUMN IF NOT EXISTS icon_id text REFERENCES images(id) ON DELETE SET NULL;
      INSERT INTO schema_migrations(version) VALUES(2) ON CONFLICT DO NOTHING;
    `);
    await db.query(`
      ALTER TABLE accounts ADD COLUMN IF NOT EXISTS bio text NOT NULL DEFAULT ''
        CHECK (char_length(bio) <= 200);
      INSERT INTO schema_migrations(version) VALUES(3) ON CONFLICT DO NOTHING;
    `);
    // Profiles: an animated picture, a banner across the top of the card, the
    // two colours the card is painted in, and a server tag worn beside the
    // name. The image table's own limits widen to admit a banner and a GIF;
    // the exact shape each kind of picture must have is checked on the way
    // in, so these are the outer bounds rather than the rules.
    //
    // Unlike the steps above this one replaces constraints, and re-adding a
    // constraint re-reads every row it covers. It runs once, not every boot.
    const {
      rows: [profiles],
    } = await db.query<{ applied: boolean }>(
      'SELECT EXISTS(SELECT 1 FROM schema_migrations WHERE version=4) AS applied',
    );
    if (!profiles?.applied) await db.query(`
      ALTER TABLE images DROP CONSTRAINT IF EXISTS images_mime_check;
      ALTER TABLE images ADD CONSTRAINT images_mime_check
        CHECK (mime IN ('image/png','image/webp','image/gif'));
      ALTER TABLE images DROP CONSTRAINT IF EXISTS images_width_check;
      ALTER TABLE images ADD CONSTRAINT images_width_check CHECK (width BETWEEN 16 AND 1500);
      ALTER TABLE images DROP CONSTRAINT IF EXISTS images_height_check;
      ALTER TABLE images ADD CONSTRAINT images_height_check CHECK (height BETWEEN 16 AND 1500);
      ALTER TABLE images DROP CONSTRAINT IF EXISTS images_bytes_check;
      ALTER TABLE images ADD CONSTRAINT images_bytes_check
        CHECK (octet_length(bytes) BETWEEN 32 AND 8388608);

      ALTER TABLE accounts ADD COLUMN IF NOT EXISTS banner_id text
        REFERENCES images(id) ON DELETE SET NULL;
      ALTER TABLE accounts ADD COLUMN IF NOT EXISTS theme_primary text
        CHECK (theme_primary ~ '^#[0-9a-f]{6}$');
      ALTER TABLE accounts ADD COLUMN IF NOT EXISTS theme_accent text
        CHECK (theme_accent ~ '^#[0-9a-f]{6}$');
      ALTER TABLE accounts ADD COLUMN IF NOT EXISTS tag_server_id uuid
        REFERENCES communities(id) ON DELETE SET NULL;

      ALTER TABLE communities ADD COLUMN IF NOT EXISTS tag_text text
        CHECK (tag_text ~ '^[A-Za-z0-9]{1,4}$');
      ALTER TABLE communities ADD COLUMN IF NOT EXISTS tag_badge text;
      ALTER TABLE communities ADD COLUMN IF NOT EXISTS tag_colour text
        CHECK (tag_colour ~ '^#[0-9a-f]{6}$');

      -- Half a theme or half a tag is not a thing anybody can see.
      ALTER TABLE accounts ADD CONSTRAINT accounts_theme_whole
        CHECK ((theme_primary IS NULL) = (theme_accent IS NULL));
      ALTER TABLE communities ADD CONSTRAINT communities_tag_whole
        CHECK ((tag_text IS NULL) = (tag_badge IS NULL) AND (tag_text IS NULL) = (tag_colour IS NULL));
      INSERT INTO schema_migrations(version) VALUES(4) ON CONFLICT DO NOTHING;
    `);
  });
}
