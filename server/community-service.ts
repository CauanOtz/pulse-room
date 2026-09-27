import { randomUUID } from 'node:crypto';
import type {
  Category,
  ChatMessage,
  Community,
  CommunityChannel,
  CommunityDetail,
  CommunityInvite,
  CommunityMember,
  MemberRole,
} from '../src/shared/community.js';
import {
  allPermissions,
  channelScoped,
  everyoneDefault,
  has,
  Permission,
  type PermissionOverride,
} from '../src/shared/permissions.js';
import {
  inChannel,
  legacyRole,
  loadAccess,
  rankOf,
  requirePermission,
  withServer,
  type Access,
} from './access.js';
import type { Database } from './database.js';
import { profileColumns, profileJoins, toAccount, type ProfileRow } from './profile.js';
import { digest, HttpError, opaqueToken } from './security.js';
import { tagDefinitions } from './tag-service.js';

/** A channel as the new clients write it: where it lives, not who may do what. */
export interface ChannelInput {
  name: string;
  type: 'text' | 'voice';
  categoryId?: string | null;
}

/**
 * A channel as older clients write it, with the switches of the fixed roles.
 * It is turned into overrides on @everyone and on the people it names.
 */
export interface LegacyChannelInput {
  name: string;
  type: 'text' | 'voice';
  private: boolean;
  memberIds: string[];
  allowSpeak: boolean;
  allowShare: boolean;
  readOnly: boolean;
}

const isLegacy = (input: ChannelInput | LegacyChannelInput): input is LegacyChannelInput => 'private' in input;

const channelColumns = `c.id, c.server_id AS "serverId", c.name, c.type,
  c.category_id AS "categoryId", c.permissions_synced AS "synced"`;
const overrideColumns = `o.target_type AS "targetType", o.target_id AS "targetId",
  o.allow::int AS allow, o.deny::int AS deny`;

interface ChannelRow {
  id: string;
  serverId: string;
  name: string;
  type: 'text' | 'voice';
  categoryId: string | null;
  synced: boolean;
}

const serverColumns = 'c.id, c.name, c.icon_id AS "iconId"';

/** Every override in a server, by the channel or category it belongs to. */
async function serverOverrides(db: Database, serverId: string) {
  const channels = new Map<string, PermissionOverride[]>();
  const categories = new Map<string, PermissionOverride[]>();
  const { rows: channelRows } = await db.query<PermissionOverride & { owner: string }>(
    `SELECT o.channel_id AS owner, ${overrideColumns} FROM channel_overrides o
    JOIN channels c ON c.id = o.channel_id WHERE c.server_id=$1`,
    [serverId],
  );
  for (const { owner, ...override } of channelRows) channels.set(owner, [...(channels.get(owner) ?? []), override]);
  const { rows: categoryRows } = await db.query<PermissionOverride & { owner: string }>(
    `SELECT o.category_id AS owner, ${overrideColumns} FROM category_overrides o
    JOIN categories c ON c.id = o.category_id WHERE c.server_id=$1`,
    [serverId],
  );
  for (const { owner, ...override } of categoryRows)
    categories.set(owner, [...(categories.get(owner) ?? []), override]);
  return { channels, categories };
}

type OverrideMaps = Awaited<ReturnType<typeof serverOverrides>>;

/** A synced channel wears its category's overrides; any other wears its own. */
const effective = (row: ChannelRow, maps: OverrideMaps): PermissionOverride[] =>
  row.synced && row.categoryId ? (maps.categories.get(row.categoryId) ?? []) : (maps.channels.get(row.id) ?? []);

const same = (a: PermissionOverride, b: PermissionOverride) =>
  a.targetType === b.targetType && a.targetId === b.targetId;
const keyOf = (o: PermissionOverride) => `${o.targetType}:${o.targetId}`;

export class CommunityService {
  constructor(private readonly db: Database) {}

  async list(userId: string): Promise<Community[]> {
    const { rows } = await this.db.query<{ id: string; name: string; iconId: string | null }>(
      `SELECT ${serverColumns} FROM communities c
      JOIN memberships m ON m.server_id=c.id WHERE m.account_id=$1 ORDER BY c.created_at,c.id`,
      [userId],
    );
    const servers: Community[] = [];
    for (const row of rows) {
      const access = await loadAccess(this.db, userId, row.id);
      const [first] = await tagDefinitions(this.db, row.id, false);
      servers.push({
        ...row,
        role: legacyRole(access),
        permissions: access.permissions,
        tag: first ? { text: first.text, badge: first.badge, colour: first.colour } : null,
      });
    }
    return servers;
  }

  /** The standing an older caller asks about. */
  async role(userId: string, serverId: string, db = this.db): Promise<MemberRole> {
    return legacyRole(await loadAccess(db, userId, serverId));
  }

  async create(userId: string, name: string): Promise<Community> {
    return this.db.transaction(async (db) => {
      await db.query('SELECT id FROM accounts WHERE id=$1 FOR UPDATE', [userId]);
      const {
        rows: [count],
      } = await db.query<{ count: string }>(
        "SELECT count(*) FROM memberships WHERE account_id=$1 AND role='owner'",
        [userId],
      );
      if (Number(count.count) >= 10) throw new HttpError(409, 'You can own up to 10 servers.');
      const id = randomUUID();
      await db.query('INSERT INTO communities(id,name) VALUES($1,$2)', [id, name]);
      await db.query("INSERT INTO memberships(server_id,account_id,role) VALUES($1,$2,'owner')", [id, userId]);
      await db.query(
        `INSERT INTO roles(id,server_id,name,position,permissions,is_default) VALUES($1,$2,'@everyone',0,$3,true)`,
        [randomUUID(), id, everyoneDefault],
      );
      for (const [channelName, type] of [
        ['general', 'text'],
        ['Lounge', 'voice'],
      ]) {
        await db.query('INSERT INTO channels(id,server_id,name,type) VALUES($1,$2,$3,$4)', [
          randomUUID(),
          id,
          channelName,
          type,
        ]);
      }
      return { id, name, role: 'owner', permissions: allPermissions, tag: null };
    });
  }

  /** Turns a stored channel into what this person sees of it. */
  private present(row: ChannelRow, access: Access, maps: OverrideMaps): CommunityChannel {
    const overrides = effective(row, maps);
    const permissions = inChannel(access, overrides);
    const everyone = access.roles.find((role) => role.isDefault);
    const everyoneOverride = overrides.find((o) => o.targetType === 'role' && o.targetId === everyone?.id);
    return {
      ...row,
      synced: Boolean(row.synced && row.categoryId),
      permissions,
      overrides: has(access.permissions, Permission.ManageChannels) ? overrides : [],
      private: Boolean(everyoneOverride && has(everyoneOverride.deny, Permission.ViewChannels)),
      memberIds: overrides
        .filter((o) => o.targetType === 'member' && has(o.allow, Permission.ViewChannels))
        .map((o) => o.targetId),
      allowSpeak: has(permissions, Permission.Speak),
      allowShare: has(permissions, Permission.ShareScreen),
      readOnly: !has(permissions, Permission.SendMessages),
    };
  }

  async detail(userId: string, serverId: string): Promise<CommunityDetail> {
    const access = await loadAccess(this.db, userId, serverId);
    const {
      rows: [serverRow],
    } = await this.db.query<{ id: string; name: string; iconId: string | null }>(
      `SELECT ${serverColumns} FROM communities c WHERE c.id=$1`,
      [serverId],
    );
    const maps = await serverOverrides(this.db, serverId);
    const { rows: channelRows } = await this.db.query<ChannelRow>(
      `SELECT ${channelColumns} FROM channels c WHERE c.server_id=$1 ORDER BY c.created_at,c.id`,
      [serverId],
    );
    const channels = channelRows
      .map((row) => this.present(row, access, maps))
      .filter((channel) => has(channel.permissions ?? 0, Permission.ViewChannels));

    const managesChannels = has(access.permissions, Permission.ManageChannels);
    const { rows: categoryRows } = await this.db.query<{ id: string; name: string }>(
      'SELECT id, name FROM categories WHERE server_id=$1 ORDER BY created_at, id',
      [serverId],
    );
    // A category with nothing in it you can see is only a heading, and says
    // what exists where you cannot go; people who arrange channels see them all.
    const categories: Category[] = categoryRows
      .filter((category) => managesChannels || channels.some((channel) => channel.categoryId === category.id))
      .map((category) => ({
        ...category,
        overrides: managesChannels ? (maps.categories.get(category.id) ?? []) : [],
      }));

    const { rows: memberRows } = await this.db.query<
      ProfileRow & {
        isOwner: boolean;
        timeoutUntil: string | null;
        muted: boolean;
        deafened: boolean;
        joinedAt: string | null;
        moveTo: string | null;
      }
    >(
      `SELECT ${profileColumns}, m.role='owner' AS "isOwner",
        CASE WHEN m.timeout_until > now() THEN m.timeout_until END AS "timeoutUntil", m.muted, m.deafened,
        m.joined_at AS "joinedAt", m.move_to AS "moveTo"
      FROM accounts a JOIN memberships m ON a.id=m.account_id ${profileJoins('$1')}
      WHERE m.server_id=$1 ORDER BY a.username`,
      [serverId],
    );
    const { rows: held } = await this.db.query<{ accountId: string; roleId: string }>(
      'SELECT account_id AS "accountId", role_id AS "roleId" FROM member_roles WHERE server_id=$1',
      [serverId],
    );
    const members: CommunityMember[] = memberRows.map(({ isOwner, moveTo, ...row }) => {
      const roleIds = held.filter((entry) => entry.accountId === row.id).map((entry) => entry.roleId);
      return {
        ...toAccount(row),
        // Where somebody has been asked to move is theirs to read, nobody else's.
        ...(row.id === userId && moveTo ? { moveTo } : {}),
        role: legacyRole({ member: { id: row.id, isOwner, roleIds }, roles: access.roles }),
        roleIds,
      };
    });
    const tags = await tagDefinitions(this.db, serverId, has(access.permissions, Permission.ManageTags));
    const [first] = tags;
    return {
      server: {
        ...serverRow,
        role: legacyRole(access),
        permissions: access.permissions,
        tag: first ? { text: first.text, badge: first.badge, colour: first.colour } : null,
      },
      channels,
      members,
      roles: access.roles,
      categories,
      tags,
    };
  }

  /**
   * One channel, for somebody who can see it. A channel they cannot see is
   * answered exactly like one that does not exist.
   */
  async channel(
    userId: string,
    channelId: string,
    db = this.db,
  ): Promise<{ channel: CommunityChannel; access: Access; permissions: number; role: MemberRole }> {
    const {
      rows: [row],
    } = await db.query<ChannelRow>(`SELECT ${channelColumns} FROM channels c WHERE c.id=$1`, [channelId]);
    if (!row) throw new HttpError(404, 'Channel not found or access denied.');
    let access: Access;
    try {
      access = await loadAccess(db, userId, row.serverId);
    } catch {
      throw new HttpError(404, 'Channel not found or access denied.');
    }
    const channel = this.present(row, access, await serverOverrides(db, row.serverId));
    const permissions = channel.permissions ?? 0;
    if (!has(permissions, Permission.ViewChannels)) throw new HttpError(404, 'Channel not found or access denied.');
    return { channel, access, permissions, role: legacyRole(access) };
  }

  /** Only somebody who manages the server changes the icon; the old one is dropped. */
  async setIcon(
    userId: string,
    serverId: string,
    imageId: string | null,
    images: { collect(id: string | null | undefined, db?: Database): Promise<void> },
  ): Promise<void> {
    await withServer(this.db, userId, serverId, async (db, access) => {
      requirePermission(access, Permission.ManageServer, 'You need Manage server to change the picture.');
      const {
        rows: [current],
      } = await db.query<{ iconId: string | null }>('SELECT icon_id AS "iconId" FROM communities WHERE id=$1', [
        serverId,
      ]);
      await db.query('UPDATE communities SET icon_id=$2 WHERE id=$1', [serverId, imageId]);
      if (current?.iconId && current.iconId !== imageId) await images.collect(current.iconId, db);
    });
  }

  async rename(userId: string, serverId: string, name: string): Promise<void> {
    await withServer(this.db, userId, serverId, async (db, access) => {
      requirePermission(access, Permission.ManageServer, 'You need Manage server to rename it.');
      await db.query('UPDATE communities SET name=$1 WHERE id=$2', [name, serverId]);
    });
  }

  async deleteServer(userId: string, serverId: string): Promise<void> {
    await withServer(this.db, userId, serverId, async (db, access) => {
      if (!access.member.isOwner) throw new HttpError(403, 'Only the owner can delete a server.');
      await db.query('DELETE FROM communities WHERE id=$1', [serverId]);
    });
  }

  /**
   * Takes somebody out of a server, with everything that named them there:
   * their roles, their tag, and the channel permissions set for them by name.
   */
  static async removeMember(db: Database, serverId: string, accountId: string): Promise<void> {
    await db.query(
      `DELETE FROM channel_overrides WHERE target_type='member' AND target_id=$2
      AND channel_id IN (SELECT id FROM channels WHERE server_id=$1)`,
      [serverId, accountId],
    );
    await db.query(
      `DELETE FROM category_overrides WHERE target_type='member' AND target_id=$2
      AND category_id IN (SELECT id FROM categories WHERE server_id=$1)`,
      [serverId, accountId],
    );
    await db.query(
      'DELETE FROM channel_members WHERE account_id=$1 AND channel_id IN (SELECT id FROM channels WHERE server_id=$2)',
      [accountId, serverId],
    );
    await db.query('DELETE FROM memberships WHERE server_id=$1 AND account_id=$2', [serverId, accountId]);
    await db.query('UPDATE accounts SET tag_server_id=NULL WHERE id=$1 AND tag_server_id=$2', [accountId, serverId]);
  }

  /** Leaving, for yourself; kicking, for somebody below you. */
  async removeFromServer(userId: string, serverId: string, targetId: string): Promise<void> {
    await withServer(this.db, userId, serverId, async (db, access) => {
      if (userId === targetId) {
        if (access.member.isOwner)
          throw new HttpError(403, 'The owner must transfer ownership or delete the server before leaving.');
      } else {
        requirePermission(access, Permission.KickMembers, 'You need Kick members to remove somebody.');
        const target = await rankOf(db, access, targetId);
        if (target.isOwner)
          throw new HttpError(403, 'The owner must transfer ownership or delete the server before leaving.');
        if (target.rank >= access.rank)
          throw new HttpError(403, 'You can only kick people whose highest role is below yours.');
      }
      await CommunityService.removeMember(db, serverId, targetId);
    });
  }

  /** The owner hands the server on; they keep every role they hold. */
  async transfer(userId: string, serverId: string, targetId: string): Promise<void> {
    await withServer(this.db, userId, serverId, async (db, access) => {
      if (!access.member.isOwner || userId === targetId)
        throw new HttpError(403, 'Choose another member to become owner.');
      await rankOf(db, access, targetId);
      await db.query("UPDATE memberships SET role='member' WHERE server_id=$1 AND account_id=$2", [serverId, userId]);
      await db.query("UPDATE memberships SET role='owner' WHERE server_id=$1 AND account_id=$2", [serverId, targetId]);
    });
  }

  // ------------------------------------------------------------ overrides

  /**
   * Checks a new set of overrides against the one it replaces. Only the
   * targets that change are judged, so somebody may save a channel that holds
   * an override they could not have made, as long as they leave it alone.
   *
   * Outside Administrator, a change must be to a role below your own (or to
   * @everyone), to a person below you (or to yourself), and may only allow or
   * deny what you may do yourself in that place.
   */
  private async checkOverrides(
    db: Database,
    access: Access,
    actorPermissions: number,
    before: readonly PermissionOverride[],
    after: readonly PermissionOverride[],
  ): Promise<void> {
    if (after.length > 100) throw new HttpError(400, 'A channel can hold up to 100 permission overrides.');
    const keys = new Set<string>();
    const { rows: members } = await db.query<{ id: string }>(
      'SELECT account_id AS id FROM memberships WHERE server_id=$1',
      [access.serverId],
    );
    for (const override of after) {
      if (keys.has(keyOf(override))) throw new HttpError(400, 'Each role or person appears once.');
      keys.add(keyOf(override));
      if ((override.allow | override.deny) & ~channelScoped)
        throw new HttpError(400, 'Only channel permissions can be set on a channel.');
      if (override.allow & override.deny) throw new HttpError(400, 'A permission cannot be allowed and denied at once.');
      if (override.targetType === 'role' && !access.roles.some((role) => role.id === override.targetId))
        throw new HttpError(400, 'That role does not belong to this server.');
      if (override.targetType === 'member' && !members.some((member) => member.id === override.targetId))
        throw new HttpError(400, 'Everybody a channel names must belong to this server.');
    }
    if (has(access.permissions, Permission.Administrator)) return;
    const changed = [
      ...after.filter((next) => {
        const previous = before.find((o) => same(o, next));
        return !previous || previous.allow !== next.allow || previous.deny !== next.deny;
      }),
      ...before
        .filter((previous) => !after.some((o) => same(o, previous)))
        .map((previous) => ({ ...previous, allow: 0, deny: 0 })),
    ];
    for (const next of changed) {
      const previous = before.find((o) => same(o, next)) ?? { allow: 0, deny: 0 };
      if (next.targetType === 'role') {
        const role = access.roles.find((entry) => entry.id === next.targetId)!;
        if (!role.isDefault && role.position >= access.rank)
          throw new HttpError(403, 'You can only change permissions for roles below your highest role.');
      } else if (next.targetId !== access.member.id) {
        const target = await rankOf(db, access, next.targetId);
        if (target.isOwner || target.rank >= access.rank)
          throw new HttpError(403, 'You can only change permissions for people below you.');
      }
      const touched = (previous.allow ^ next.allow) | (previous.deny ^ next.deny);
      if (touched & ~actorPermissions)
        throw new HttpError(403, 'You can only allow or deny permissions you have yourself.');
    }
  }

  private async writeOverrides(
    db: Database,
    table: 'channel_overrides' | 'category_overrides',
    ownerId: string,
    overrides: readonly PermissionOverride[],
  ): Promise<void> {
    const column = table === 'channel_overrides' ? 'channel_id' : 'category_id';
    await db.query(`DELETE FROM ${table} WHERE ${column}=$1`, [ownerId]);
    for (const override of overrides)
      if (override.allow || override.deny)
        await db.query(
          `INSERT INTO ${table}(${column},target_type,target_id,allow,deny) VALUES($1,$2,$3,$4,$5)`,
          [ownerId, override.targetType, override.targetId, override.allow, override.deny],
        );
  }

  /** The overrides a channel of an older client's making stands for. */
  private legacyOverrides(access: Access, input: LegacyChannelInput): PermissionOverride[] {
    const everyone = access.roles.find((role) => role.isDefault)!;
    const deny =
      (input.private ? Permission.ViewChannels : 0) |
      (input.allowSpeak ? 0 : Permission.Speak) |
      (input.allowShare ? 0 : Permission.ShareScreen) |
      (input.readOnly ? Permission.SendMessages : 0);
    const overrides: PermissionOverride[] = deny ? [{ targetType: 'role', targetId: everyone.id, allow: 0, deny }] : [];
    if (input.private)
      for (const id of new Set(input.memberIds))
        overrides.push({ targetType: 'member', targetId: id, allow: Permission.ViewChannels, deny: 0 });
    return overrides;
  }

  private async categoryOf(db: Database, serverId: string, categoryId: string | null | undefined) {
    if (!categoryId) return null;
    const {
      rows: [category],
    } = await db.query<{ id: string }>('SELECT id FROM categories WHERE id=$1 AND server_id=$2', [categoryId, serverId]);
    if (!category) throw new HttpError(400, 'That category does not belong to this server.');
    return category.id;
  }

  // -------------------------------------------------------------- channels

  async createChannel(userId: string, serverId: string, input: ChannelInput | LegacyChannelInput): Promise<string> {
    return withServer(this.db, userId, serverId, async (db, access) => {
      requirePermission(access, Permission.ManageChannels, 'You need Manage channels to create a channel.');
      const {
        rows: [count],
      } = await db.query<{ count: string }>('SELECT count(*) FROM channels WHERE server_id=$1', [serverId]);
      if (Number(count.count) >= 50) throw new HttpError(409, 'A server can have up to 50 channels.');
      const id = randomUUID();
      const categoryId = isLegacy(input) ? null : await this.categoryOf(db, serverId, input.categoryId);
      // A channel made inside a category follows it from the start.
      await db.query(
        'INSERT INTO channels(id,server_id,name,type,category_id,permissions_synced) VALUES($1,$2,$3,$4,$5,$6)',
        [id, serverId, input.name, input.type, categoryId, Boolean(categoryId)],
      );
      if (isLegacy(input)) {
        const overrides = this.legacyOverrides(access, input);
        await this.checkOverrides(db, access, access.permissions, [], overrides);
        await this.writeOverrides(db, 'channel_overrides', id, overrides);
      }
      return id;
    });
  }

  /**
   * Renames a channel or moves it. Moving into a category syncs it with the
   * category, which is a change of permissions and is judged as one; moving
   * out keeps what it had, now as its own.
   */
  async updateChannel(userId: string, channelId: string, input: ChannelInput | LegacyChannelInput): Promise<void> {
    const { channel } = await this.channel(userId, channelId);
    await withServer(this.db, userId, channel.serverId, async (db, access) => {
      requirePermission(access, Permission.ManageChannels, 'You need Manage channels to change a channel.');
      const { channel: current } = await this.channel(userId, channelId, db);
      if (current.type !== input.type) throw new HttpError(400, 'A channel cannot change server or type.');
      const before = current.overrides ?? [];
      const actorPermissions = current.permissions ?? 0;
      await db.query('UPDATE channels SET name=$2 WHERE id=$1', [channelId, input.name]);
      if (isLegacy(input)) {
        // What an older client edits is @everyone and the people let in by
        // name. The roles it never knew about are left as they were.
        const everyone = access.roles.find((role) => role.isDefault)!;
        const kept = before.filter((o) => o.targetType === 'role' && o.targetId !== everyone.id);
        const next = [...kept, ...this.legacyOverrides(access, input)];
        await this.checkOverrides(db, access, actorPermissions, before, next);
        await this.writeOverrides(db, 'channel_overrides', channelId, next);
        await db.query('UPDATE channels SET permissions_synced=false WHERE id=$1', [channelId]);
        return;
      }
      if (input.categoryId === undefined || input.categoryId === (current.categoryId ?? null)) return;
      const categoryId = await this.categoryOf(db, channel.serverId, input.categoryId);
      if (categoryId) {
        const maps = await serverOverrides(db, channel.serverId);
        const next = maps.categories.get(categoryId) ?? [];
        await this.checkOverrides(db, access, actorPermissions, before, next);
        await db.query('DELETE FROM channel_overrides WHERE channel_id=$1', [channelId]);
        await db.query('UPDATE channels SET category_id=$2, permissions_synced=true WHERE id=$1', [
          channelId,
          categoryId,
        ]);
      } else {
        await this.writeOverrides(db, 'channel_overrides', channelId, before);
        await db.query('UPDATE channels SET category_id=NULL, permissions_synced=false WHERE id=$1', [channelId]);
      }
    });
  }

  /** Gives a channel permissions of its own, which stops it following its category. */
  async setChannelOverrides(userId: string, channelId: string, overrides: PermissionOverride[]): Promise<void> {
    const { channel } = await this.channel(userId, channelId);
    await withServer(this.db, userId, channel.serverId, async (db, access) => {
      requirePermission(access, Permission.ManageChannels, 'You need Manage channels to change its permissions.');
      const { channel: current } = await this.channel(userId, channelId, db);
      await this.checkOverrides(db, access, current.permissions ?? 0, current.overrides ?? [], overrides);
      await this.writeOverrides(db, 'channel_overrides', channelId, overrides);
      await db.query('UPDATE channels SET permissions_synced=false WHERE id=$1', [channelId]);
    });
  }

  /** Throws away a channel's own permissions and follows its category again. */
  async syncChannel(userId: string, channelId: string): Promise<void> {
    const { channel } = await this.channel(userId, channelId);
    await withServer(this.db, userId, channel.serverId, async (db, access) => {
      requirePermission(access, Permission.ManageChannels, 'You need Manage channels to sync a channel.');
      const { channel: current } = await this.channel(userId, channelId, db);
      if (!current.categoryId) throw new HttpError(400, 'Only a channel in a category can follow one.');
      const maps = await serverOverrides(db, channel.serverId);
      await this.checkOverrides(
        db,
        access,
        current.permissions ?? 0,
        current.overrides ?? [],
        maps.categories.get(current.categoryId) ?? [],
      );
      await db.query('DELETE FROM channel_overrides WHERE channel_id=$1', [channelId]);
      await db.query('UPDATE channels SET permissions_synced=true WHERE id=$1', [channelId]);
    });
  }

  async deleteChannel(userId: string, channelId: string): Promise<void> {
    const { channel } = await this.channel(userId, channelId);
    await withServer(this.db, userId, channel.serverId, async (db, access) => {
      requirePermission(access, Permission.ManageChannels, 'You need Manage channels to delete a channel.');
      await db.query('DELETE FROM channels WHERE id=$1', [channelId]);
    });
  }

  // ------------------------------------------------------------ categories

  async createCategory(userId: string, serverId: string, name: string): Promise<string> {
    return withServer(this.db, userId, serverId, async (db, access) => {
      requirePermission(access, Permission.ManageChannels, 'You need Manage channels to create a category.');
      const {
        rows: [count],
      } = await db.query<{ count: string }>('SELECT count(*) FROM categories WHERE server_id=$1', [serverId]);
      if (Number(count.count) >= 20) throw new HttpError(409, 'A server can have up to 20 categories.');
      const id = randomUUID();
      await db.query('INSERT INTO categories(id,server_id,name) VALUES($1,$2,$3)', [id, serverId, name]);
      return id;
    });
  }

  private async categoryServer(categoryId: string): Promise<string> {
    const {
      rows: [category],
    } = await this.db.query<{ serverId: string }>('SELECT server_id AS "serverId" FROM categories WHERE id=$1', [
      categoryId,
    ]);
    if (!category) throw new HttpError(404, 'Category not found.');
    return category.serverId;
  }

  async renameCategory(userId: string, categoryId: string, name: string): Promise<void> {
    const serverId = await this.categoryServer(categoryId);
    await withServer(this.db, userId, serverId, async (db, access) => {
      requirePermission(access, Permission.ManageChannels, 'You need Manage channels to rename a category.');
      await db.query('UPDATE categories SET name=$2 WHERE id=$1', [categoryId, name]);
    });
  }

  /**
   * Changes a category's permissions, and with them every channel still
   * synced with it. A category is judged as a channel would be.
   */
  async setCategoryOverrides(userId: string, categoryId: string, overrides: PermissionOverride[]): Promise<void> {
    const serverId = await this.categoryServer(categoryId);
    await withServer(this.db, userId, serverId, async (db, access) => {
      requirePermission(access, Permission.ManageChannels, 'You need Manage channels to change its permissions.');
      const before = (await serverOverrides(db, serverId)).categories.get(categoryId) ?? [];
      await this.checkOverrides(db, access, inChannel(access, before), before, overrides);
      await this.writeOverrides(db, 'category_overrides', categoryId, overrides);
    });
  }

  /**
   * Deletes a category but none of its channels. A channel that followed it
   * keeps the permissions it had, now as its own, so deleting a heading never
   * opens a private room.
   */
  async deleteCategory(userId: string, categoryId: string): Promise<void> {
    const serverId = await this.categoryServer(categoryId);
    await withServer(this.db, userId, serverId, async (db, access) => {
      requirePermission(access, Permission.ManageChannels, 'You need Manage channels to delete a category.');
      const inherited = (await serverOverrides(db, serverId)).categories.get(categoryId) ?? [];
      const { rows: synced } = await db.query<{ id: string }>(
        'SELECT id FROM channels WHERE category_id=$1 AND permissions_synced',
        [categoryId],
      );
      for (const { id } of synced) await this.writeOverrides(db, 'channel_overrides', id, inherited);
      await db.query('UPDATE channels SET permissions_synced=false, category_id=NULL WHERE category_id=$1', [
        categoryId,
      ]);
      await db.query('DELETE FROM categories WHERE id=$1', [categoryId]);
    });
  }

  // --------------------------------------------------------------- invites

  async invite(userId: string, serverId: string, maxUses: number, hours: number): Promise<{ code: string }> {
    return withServer(this.db, userId, serverId, async (db, access) => {
      requirePermission(access, Permission.CreateInvites, 'You need Create invitations to invite people.');
      const code = opaqueToken();
      await db.query(
        'INSERT INTO invitations(id,server_id,code_hash,expires_at,max_uses) VALUES($1,$2,$3,$4,$5)',
        [randomUUID(), serverId, digest(code), new Date(Date.now() + hours * 3600_000), maxUses],
      );
      return { code };
    });
  }

  async invites(userId: string, serverId: string): Promise<CommunityInvite[]> {
    requirePermission(
      await loadAccess(this.db, userId, serverId),
      Permission.ManageServer,
      'You need Manage server to see invitations.',
    );
    return (
      await this.db.query<CommunityInvite>(
        `SELECT id,expires_at AS "expiresAt",uses,max_uses AS "maxUses"
      FROM invitations WHERE server_id=$1 AND NOT revoked AND expires_at>now() AND uses<max_uses ORDER BY expires_at`,
        [serverId],
      )
    ).rows;
  }

  async revokeInvite(userId: string, serverId: string, inviteId: string): Promise<void> {
    await withServer(this.db, userId, serverId, async (db, access) => {
      requirePermission(access, Permission.ManageServer, 'You need Manage server to revoke invitations.');
      await db.query('UPDATE invitations SET revoked=true WHERE id=$1 AND server_id=$2', [inviteId, serverId]);
    });
  }

  async join(userId: string, code: string): Promise<{ serverId: string }> {
    return this.db.transaction(async (db) => {
      // Same lock order as the writes above, then consume atomically.
      const {
        rows: [lookup],
      } = await db.query<{ serverId: string }>('SELECT server_id AS "serverId" FROM invitations WHERE code_hash=$1', [
        digest(code),
      ]);
      if (!lookup) throw new HttpError(404, 'Invite is invalid or expired.');
      await db.query('SELECT id FROM communities WHERE id=$1 FOR UPDATE', [lookup.serverId]);
      const {
        rows: [invite],
      } = await db.query<{ id: string; serverId: string }>(
        `SELECT id,server_id AS "serverId" FROM invitations
        WHERE code_hash=$1 AND NOT revoked AND expires_at>now() AND uses<max_uses FOR UPDATE`,
        [digest(code)],
      );
      if (!invite) throw new HttpError(404, 'Invite is invalid or expired.');
      const banned = await db.query('SELECT 1 FROM bans WHERE server_id=$1 AND account_id=$2', [
        invite.serverId,
        userId,
      ]);
      if (banned.rows.length) throw new HttpError(403, 'You are banned from this server.');
      const existing = await db.query('SELECT 1 FROM memberships WHERE server_id=$1 AND account_id=$2', [
        invite.serverId,
        userId,
      ]);
      if (!existing.rows.length) {
        const {
          rows: [count],
        } = await db.query<{ count: string }>('SELECT count(*) FROM memberships WHERE server_id=$1', [
          invite.serverId,
        ]);
        if (Number(count.count) >= 100) throw new HttpError(409, 'This server has reached its 100-member limit.');
        await db.query("INSERT INTO memberships(server_id,account_id,role) VALUES($1,$2,'member')", [
          invite.serverId,
          userId,
        ]);
        await db.query('UPDATE invitations SET uses=uses+1 WHERE id=$1', [invite.id]);
      }
      return { serverId: invite.serverId };
    });
  }

  // -------------------------------------------------------------- messages

  async messages(userId: string, channelId: string, before?: string): Promise<ChatMessage[]> {
    const { channel } = await this.channel(userId, channelId);
    if (channel.type !== 'text') throw new HttpError(400, 'Messages belong to text channels.');
    return (
      await this.db.query<ChatMessage>(
        `SELECT m.id,m.channel_id AS "channelId",m.author_id AS "authorId",
      a.display_name AS "authorName",m.content,m.created_at AS "createdAt" FROM messages m JOIN accounts a ON a.id=m.author_id
      WHERE m.channel_id=$1 AND ($2::uuid IS NULL OR (m.created_at,m.id)<(
        SELECT created_at,id FROM messages WHERE id=$2 AND channel_id=$1))
      ORDER BY m.created_at DESC,m.id DESC LIMIT 50`,
        [channelId, before ?? null],
      )
    ).rows.reverse();
  }

  async sendMessage(userId: string, channelId: string, content: string): Promise<void> {
    const { channel } = await this.channel(userId, channelId);
    await withServer(this.db, userId, channel.serverId, async (db, access) => {
      const { channel: current, permissions } = await this.channel(userId, channelId, db);
      if (current.type !== 'text' || !has(permissions, Permission.SendMessages))
        throw new HttpError(
          403,
          access.timedOut ? 'You are in a timeout and cannot write yet.' : 'You cannot send messages in this channel.',
        );
      await db.query('INSERT INTO messages(id,channel_id,author_id,content) VALUES($1,$2,$3,$4)', [
        randomUUID(),
        channelId,
        userId,
        content,
      ]);
    });
  }

  async deleteMessage(userId: string, channelId: string, messageId: string): Promise<void> {
    const { permissions } = await this.channel(userId, channelId);
    await this.db.query('DELETE FROM messages WHERE id=$1 AND channel_id=$2 AND (author_id=$3 OR $4)', [
      messageId,
      channelId,
      userId,
      has(permissions, Permission.ManageMessages),
    ]);
  }
}
