import { randomUUID } from 'node:crypto';
import type { ServerTag, ServerTagDefinition, TagBadge, TagChoice, TagMode } from '../src/shared/community.js';
import { Permission } from '../src/shared/permissions.js';
import { loadAccess, requirePermission, withServer } from './access.js';
import type { Database } from './database.js';
import { HttpError } from './security.js';

export interface TagInput extends ServerTag {
  name: string;
  mode: TagMode;
  roleIds: string[];
}

/**
 * Whether the person in `mt` may wear the tag in `st`, as SQL. The owner may
 * wear any tag of their own server; otherwise it is the tag's own rule.
 */
const eligible = `(
  EXISTS (SELECT 1 FROM memberships om WHERE om.server_id = st.server_id AND om.account_id = mt.account_id AND om.role = 'owner')
  OR st.mode = 'everyone'
  OR (st.mode = 'roles' AND EXISTS (
    SELECT 1 FROM tag_roles tr JOIN member_roles mr ON mr.role_id = tr.role_id
    WHERE tr.tag_id = st.id AND mr.account_id = mt.account_id))
  OR (st.mode = 'assigned' AND EXISTS (
    SELECT 1 FROM tag_holders th WHERE th.tag_id = st.id AND th.account_id = mt.account_id))
)`;

/**
 * Takes a tag off everybody who can no longer wear it. Run after anything that
 * could change who may: a role taken away or deleted, a tag's rule changed, a
 * tag taken back from its holder. A tag lost this way does not come back on
 * its own if the role does.
 */
export async function pruneTags(db: Database, serverId: string): Promise<void> {
  await db.query(
    `DELETE FROM member_tags mt USING server_tags st
    WHERE mt.tag_id = st.id AND mt.server_id = $1 AND NOT ${eligible}`,
    [serverId],
  );
}

/** A server's tags, oldest first; who holds an assigned one only for those who hand them out. */
export async function tagDefinitions(
  db: Database,
  serverId: string,
  includeHolders: boolean,
): Promise<ServerTagDefinition[]> {
  const { rows } = await db.query<{
    id: string;
    text: string;
    badge: TagBadge;
    colour: string;
    name: string;
    mode: TagMode;
  }>('SELECT id, text, badge, colour, name, mode FROM server_tags WHERE server_id=$1 ORDER BY created_at, id', [
    serverId,
  ]);
  const { rows: roles } = await db.query<{ tagId: string; roleId: string }>(
    `SELECT tr.tag_id AS "tagId", tr.role_id AS "roleId" FROM tag_roles tr
    JOIN server_tags st ON st.id = tr.tag_id WHERE st.server_id=$1`,
    [serverId],
  );
  const { rows: holders } = includeHolders
    ? await db.query<{ tagId: string; accountId: string }>(
        'SELECT tag_id AS "tagId", account_id AS "accountId" FROM tag_holders WHERE server_id=$1',
        [serverId],
      )
    : { rows: [] };
  return rows.map((row) => ({
    ...row,
    roleIds: roles.filter((entry) => entry.tagId === row.id).map((entry) => entry.roleId),
    holderIds: holders.filter((entry) => entry.tagId === row.id).map((entry) => entry.accountId),
  }));
}

export class TagService {
  constructor(private readonly db: Database) {}

  private async checkRoles(db: Database, serverId: string, input: TagInput): Promise<void> {
    if (input.mode === 'roles' && input.roleIds.length === 0)
      throw new HttpError(400, 'Choose at least one role that may wear this tag.');
    if (!input.roleIds.length) return;
    const { rows } = await db.query<{ id: string }>(
      'SELECT id FROM roles WHERE server_id=$1 AND NOT is_default AND id = ANY($2::uuid[])',
      [serverId, input.roleIds],
    );
    if (rows.length !== new Set(input.roleIds).size) throw new HttpError(400, 'Those roles do not belong to this server.');
  }

  private async writeRoles(db: Database, tagId: string, input: TagInput): Promise<void> {
    await db.query('DELETE FROM tag_roles WHERE tag_id=$1', [tagId]);
    if (input.mode !== 'roles') return;
    for (const roleId of new Set(input.roleIds))
      await db.query('INSERT INTO tag_roles(tag_id, role_id) VALUES($1,$2)', [tagId, roleId]);
  }

  async create(userId: string, serverId: string, input: TagInput): Promise<string> {
    return withServer(this.db, userId, serverId, async (db, access) => {
      requirePermission(access, Permission.ManageTags, 'You need Manage tags to create a tag.');
      const {
        rows: [count],
      } = await db.query<{ count: string }>('SELECT count(*) FROM server_tags WHERE server_id=$1', [serverId]);
      if (Number(count.count) >= 20) throw new HttpError(409, 'A server can have up to 20 tags.');
      await this.checkRoles(db, serverId, input);
      const id = randomUUID();
      await db.query(
        'INSERT INTO server_tags(id, server_id, text, badge, colour, name, mode) VALUES($1,$2,$3,$4,$5,$6,$7)',
        [id, serverId, input.text, input.badge, input.colour, input.name, input.mode],
      );
      await this.writeRoles(db, id, input);
      return id;
    });
  }

  private async tagServer(tagId: string): Promise<string> {
    const {
      rows: [tag],
    } = await this.db.query<{ serverId: string }>('SELECT server_id AS "serverId" FROM server_tags WHERE id=$1', [
      tagId,
    ]);
    if (!tag) throw new HttpError(404, 'Tag not found.');
    return tag.serverId;
  }

  async update(userId: string, tagId: string, input: TagInput): Promise<void> {
    const serverId = await this.tagServer(tagId);
    await withServer(this.db, userId, serverId, async (db, access) => {
      requirePermission(access, Permission.ManageTags, 'You need Manage tags to change a tag.');
      await this.checkRoles(db, serverId, input);
      await db.query('UPDATE server_tags SET text=$2, badge=$3, colour=$4, name=$5, mode=$6 WHERE id=$1', [
        tagId,
        input.text,
        input.badge,
        input.colour,
        input.name,
        input.mode,
      ]);
      await this.writeRoles(db, tagId, input);
      await pruneTags(db, serverId);
    });
  }

  /** Deleting a tag takes it off everybody wearing it, by the foreign key. */
  async remove(userId: string, tagId: string): Promise<void> {
    const serverId = await this.tagServer(tagId);
    await withServer(this.db, userId, serverId, async (db, access) => {
      requirePermission(access, Permission.ManageTags, 'You need Manage tags to delete a tag.');
      await db.query('DELETE FROM server_tags WHERE id=$1', [tagId]);
    });
  }

  /** Hands an assigned tag to somebody, or with `held` false takes it back. */
  async assign(userId: string, tagId: string, targetId: string, held: boolean): Promise<void> {
    const serverId = await this.tagServer(tagId);
    await withServer(this.db, userId, serverId, async (db, access) => {
      requirePermission(access, Permission.ManageTags, 'You need Manage tags to hand out a tag.');
      const {
        rows: [tag],
      } = await db.query<{ mode: TagMode }>('SELECT mode FROM server_tags WHERE id=$1', [tagId]);
      if (tag.mode !== 'assigned') throw new HttpError(400, 'Only a tag staff assign is handed out.');
      const member = await db.query('SELECT 1 FROM memberships WHERE server_id=$1 AND account_id=$2', [
        serverId,
        targetId,
      ]);
      if (!member.rows.length) throw new HttpError(404, 'That person is not in this server.');
      if (held)
        await db.query(
          'INSERT INTO tag_holders(tag_id, server_id, account_id) VALUES($1,$2,$3) ON CONFLICT DO NOTHING',
          [tagId, serverId, targetId],
        );
      else {
        await db.query('DELETE FROM tag_holders WHERE tag_id=$1 AND account_id=$2', [tagId, targetId]);
        await pruneTags(db, serverId);
      }
    });
  }

  /**
   * Wears one of a server's tags there, or with null none. Only a tag of that
   * server, and only one you may wear: anything else would let somebody dress
   * up as something the server never gave them.
   */
  async wear(userId: string, serverId: string, tagId: string | null): Promise<void> {
    await withServer(this.db, userId, serverId, async (db) => {
      if (!tagId) {
        await db.query('DELETE FROM member_tags WHERE server_id=$1 AND account_id=$2', [serverId, userId]);
        return;
      }
      const {
        rows: [allowed],
      } = await db.query<{ ok: boolean }>(
        `SELECT ${eligible} AS ok FROM server_tags st, (SELECT $3::uuid AS account_id) mt
        WHERE st.id=$1 AND st.server_id=$2`,
        [tagId, serverId, userId],
      );
      if (!allowed?.ok) throw new HttpError(403, 'You cannot wear that tag.');
      await db.query(
        `INSERT INTO member_tags(server_id, account_id, tag_id) VALUES($1,$2,$3)
        ON CONFLICT (server_id, account_id) DO UPDATE SET tag_id=EXCLUDED.tag_id`,
        [serverId, userId, tagId],
      );
    });
  }

  /** For every server you are in that has tags, the ones you may wear and the one you do. */
  async choices(userId: string): Promise<TagChoice[]> {
    const { rows: servers } = await this.db.query<{ id: string; name: string }>(
      `SELECT c.id, c.name FROM communities c JOIN memberships m ON m.server_id=c.id
      WHERE m.account_id=$1 AND EXISTS (SELECT 1 FROM server_tags t WHERE t.server_id=c.id)
      ORDER BY c.created_at, c.id`,
      [userId],
    );
    const choices: TagChoice[] = [];
    for (const server of servers) {
      await loadAccess(this.db, userId, server.id);
      const { rows: tags } = await this.db.query<TagChoice['tags'][number]>(
        `SELECT st.id, st.text, st.badge, st.colour, st.name FROM server_tags st,
          (SELECT $2::uuid AS account_id) mt
        WHERE st.server_id=$1 AND ${eligible} ORDER BY st.created_at, st.id`,
        [server.id, userId],
      );
      if (!tags.length) continue;
      const {
        rows: [worn],
      } = await this.db.query<{ tagId: string }>(
        'SELECT tag_id AS "tagId" FROM member_tags WHERE server_id=$1 AND account_id=$2',
        [server.id, userId],
      );
      choices.push({ serverId: server.id, serverName: server.name, tags, activeId: worn?.tagId ?? null });
    }
    return choices;
  }
}
