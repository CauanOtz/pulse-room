import pg from 'pg';
import { everyoneDefault, Permission } from '../src/shared/permissions.js';

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
    await migrateRoles(db);
    // When somebody joined a server, and where they have been asked to move
    // to. Nobody knows when the people already in a server joined it, so they
    // are left without a date rather than all given today's.
    await db.query(`
      ALTER TABLE memberships ADD COLUMN IF NOT EXISTS joined_at timestamptz;
      ALTER TABLE memberships ALTER COLUMN joined_at SET DEFAULT now();
      ALTER TABLE memberships ADD COLUMN IF NOT EXISTS move_to uuid REFERENCES channels(id) ON DELETE SET NULL;
      INSERT INTO schema_migrations(version) VALUES(6) ON CONFLICT DO NOTHING;
    `);
  });
}

/**
 * Roles, channel permissions, categories, moderation and tags that belong to
 * roles. What the three fixed roles and the per-channel switches used to mean
 * is carried across as data, once:
 *
 * - every server gets @everyone, allowed what a member could always do;
 * - administrators get a role called Admin that holds Administrator;
 * - a private channel denies @everyone the sight of it and allows it to each
 *   person it listed, and a channel that silenced, stopped sharing or was
 *   read-only denies @everyone that one thing;
 * - a server's single tag becomes its first tag, open to everybody, and
 *   whoever wore it still does.
 *
 * The old columns are left where they are, unread, so an older service can
 * still start against this database while a deployment rolls over.
 */
async function migrateRoles(db: Database): Promise<void> {
  const {
    rows: [roles],
  } = await db.query<{ applied: boolean }>(
    'SELECT EXISTS(SELECT 1 FROM schema_migrations WHERE version=5) AS applied',
  );
  if (roles?.applied) return;
  const view = Permission.ViewChannels;
  await db.query(`
    CREATE TABLE IF NOT EXISTS roles (
      id uuid PRIMARY KEY,
      server_id uuid NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
      name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 32),
      colour text CHECK (colour ~ '^#[0-9a-f]{6}$'),
      position integer NOT NULL CHECK (position >= 0),
      permissions bigint NOT NULL DEFAULT 0 CHECK (permissions >= 0),
      is_default boolean NOT NULL DEFAULT false,
      hoist boolean NOT NULL DEFAULT false,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS roles_server_idx ON roles(server_id);
    CREATE UNIQUE INDEX IF NOT EXISTS roles_one_default_idx ON roles(server_id) WHERE is_default;

    CREATE TABLE IF NOT EXISTS member_roles (
      server_id uuid NOT NULL,
      account_id uuid NOT NULL,
      role_id uuid NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
      PRIMARY KEY(account_id, role_id),
      FOREIGN KEY(server_id, account_id) REFERENCES memberships(server_id, account_id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS member_roles_server_idx ON member_roles(server_id);

    CREATE TABLE IF NOT EXISTS categories (
      id uuid PRIMARY KEY,
      server_id uuid NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
      name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 60),
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS categories_server_idx ON categories(server_id);
    ALTER TABLE channels ADD COLUMN IF NOT EXISTS category_id uuid REFERENCES categories(id) ON DELETE SET NULL;
    ALTER TABLE channels ADD COLUMN IF NOT EXISTS permissions_synced boolean NOT NULL DEFAULT false;

    CREATE TABLE IF NOT EXISTS channel_overrides (
      channel_id uuid NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
      target_type text NOT NULL CHECK (target_type IN ('role','member')),
      target_id uuid NOT NULL,
      allow bigint NOT NULL DEFAULT 0 CHECK (allow >= 0),
      deny bigint NOT NULL DEFAULT 0 CHECK (deny >= 0),
      PRIMARY KEY(channel_id, target_type, target_id),
      CHECK (allow & deny = 0)
    );
    CREATE TABLE IF NOT EXISTS category_overrides (
      category_id uuid NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
      target_type text NOT NULL CHECK (target_type IN ('role','member')),
      target_id uuid NOT NULL,
      allow bigint NOT NULL DEFAULT 0 CHECK (allow >= 0),
      deny bigint NOT NULL DEFAULT 0 CHECK (deny >= 0),
      PRIMARY KEY(category_id, target_type, target_id),
      CHECK (allow & deny = 0)
    );

    ALTER TABLE memberships ADD COLUMN IF NOT EXISTS timeout_until timestamptz;
    ALTER TABLE memberships ADD COLUMN IF NOT EXISTS muted boolean NOT NULL DEFAULT false;
    ALTER TABLE memberships ADD COLUMN IF NOT EXISTS deafened boolean NOT NULL DEFAULT false;
    CREATE TABLE IF NOT EXISTS bans (
      server_id uuid NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
      account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      reason text NOT NULL DEFAULT '' CHECK (char_length(reason) <= 200),
      banned_by uuid REFERENCES accounts(id) ON DELETE SET NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY(server_id, account_id)
    );

    CREATE TABLE IF NOT EXISTS server_tags (
      id uuid PRIMARY KEY,
      server_id uuid NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
      text text NOT NULL CHECK (text ~ '^[A-Za-z0-9]{1,4}$'),
      badge text NOT NULL,
      colour text NOT NULL CHECK (colour ~ '^#[0-9a-f]{6}$'),
      name text NOT NULL DEFAULT '' CHECK (char_length(name) <= 32),
      mode text NOT NULL CHECK (mode IN ('everyone','roles','assigned')),
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS server_tags_server_idx ON server_tags(server_id);
    CREATE TABLE IF NOT EXISTS tag_roles (
      tag_id uuid NOT NULL REFERENCES server_tags(id) ON DELETE CASCADE,
      role_id uuid NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
      PRIMARY KEY(tag_id, role_id)
    );
    CREATE TABLE IF NOT EXISTS tag_holders (
      tag_id uuid NOT NULL REFERENCES server_tags(id) ON DELETE CASCADE,
      server_id uuid NOT NULL,
      account_id uuid NOT NULL,
      PRIMARY KEY(tag_id, account_id),
      FOREIGN KEY(server_id, account_id) REFERENCES memberships(server_id, account_id) ON DELETE CASCADE
    );
    -- One tag worn per server, whatever else somebody may hold there.
    CREATE TABLE IF NOT EXISTS member_tags (
      server_id uuid NOT NULL,
      account_id uuid NOT NULL,
      tag_id uuid NOT NULL REFERENCES server_tags(id) ON DELETE CASCADE,
      PRIMARY KEY(server_id, account_id),
      FOREIGN KEY(server_id, account_id) REFERENCES memberships(server_id, account_id) ON DELETE CASCADE
    );

    INSERT INTO roles(id, server_id, name, position, permissions, is_default)
    SELECT gen_random_uuid(), c.id, '@everyone', 0, ${everyoneDefault}, true FROM communities c
    WHERE NOT EXISTS (SELECT 1 FROM roles r WHERE r.server_id = c.id AND r.is_default);

    INSERT INTO roles(id, server_id, name, position, permissions, hoist)
    SELECT gen_random_uuid(), c.id, 'Admin', 1, ${Permission.Administrator}, true FROM communities c
    WHERE EXISTS (SELECT 1 FROM memberships m WHERE m.server_id = c.id AND m.role = 'admin');
    INSERT INTO member_roles(server_id, account_id, role_id)
    SELECT m.server_id, m.account_id, r.id FROM memberships m
    JOIN roles r ON r.server_id = m.server_id AND r.name = 'Admin' AND NOT r.is_default
    WHERE m.role = 'admin';
    UPDATE memberships SET role = 'member' WHERE role = 'admin';

    INSERT INTO channel_overrides(channel_id, target_type, target_id, allow, deny)
    SELECT ch.id, 'role', r.id, 0,
      (CASE WHEN ch.private THEN ${view} ELSE 0 END)
      | (CASE WHEN NOT ch.allow_speak THEN ${Permission.Speak} ELSE 0 END)
      | (CASE WHEN NOT ch.allow_share THEN ${Permission.ShareScreen} ELSE 0 END)
      | (CASE WHEN ch.read_only THEN ${Permission.SendMessages} ELSE 0 END)
    FROM channels ch JOIN roles r ON r.server_id = ch.server_id AND r.is_default
    WHERE ch.private OR NOT ch.allow_speak OR NOT ch.allow_share OR ch.read_only;
    INSERT INTO channel_overrides(channel_id, target_type, target_id, allow, deny)
    SELECT cm.channel_id, 'member', cm.account_id, ${view}, 0
    FROM channel_members cm JOIN channels ch ON ch.id = cm.channel_id
    WHERE ch.private;

    INSERT INTO server_tags(id, server_id, text, badge, colour, mode)
    SELECT gen_random_uuid(), c.id, c.tag_text, c.tag_badge, c.tag_colour, 'everyone'
    FROM communities c WHERE c.tag_text IS NOT NULL;
    INSERT INTO member_tags(server_id, account_id, tag_id)
    SELECT a.tag_server_id, a.id, t.id FROM accounts a
    JOIN server_tags t ON t.server_id = a.tag_server_id
    JOIN memberships m ON m.server_id = a.tag_server_id AND m.account_id = a.id;

    INSERT INTO schema_migrations(version) VALUES(5) ON CONFLICT DO NOTHING;
  `);
}
