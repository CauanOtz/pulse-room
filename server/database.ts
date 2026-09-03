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
  });
}
