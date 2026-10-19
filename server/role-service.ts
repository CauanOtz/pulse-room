import { randomUUID } from 'node:crypto';
import type { Ban, Role } from '../src/shared/community.js';
import { allPermissions, has, Permission } from '../src/shared/permissions.js';
import { loadAccess, rankOf, requireAbove, requirePermission, withServer, type Access } from './access.js';
import { CommunityService } from './community-service.js';
import type { Database } from './database.js';
import { HttpError } from './security.js';
import { pruneTags } from './tag-service.js';
import { ImageService } from './image-service.js';

export interface RoleInput {
  name: string;
  colour: string | null;
  permissions: number;
  hoist: boolean;
  description?: string;
  iconId?: string | null;
}
export type RolePatch = Partial<RoleInput> & { expectedRevision?: number };

export interface ModerationInput {
  /** Minutes from now, or null to lift a timeout. */
  timeoutMinutes?: number | null;
  muted?: boolean;
  deafened?: boolean;
}

/**
 * Roles and what is done to people with them.
 *
 * Every rule of the hierarchy is checked here, on the service, whatever a
 * client shows: nobody edits, deletes, hands out or reorders a role at or above
 * their own highest one; nobody grants a permission they do not have; nobody
 * acts on a person at or above them; nobody acts on the owner.
 */
export class RoleService {
  constructor(private readonly db: Database) {}

  private isAdministrator(access: Access): boolean {
    return has(access.permissions, Permission.Administrator);
  }

  /** Only what the actor holds may be given, unless they hold everything. */
  private checkGrant(access: Access, before: number, after: number): void {
    if (after & ~allPermissions) throw new HttpError(400, 'Those permissions do not exist.');
    if (this.isAdministrator(access)) return;
    if ((before ^ after) & ~access.permissions)
      throw new HttpError(403, 'You can only grant or remove permissions you have yourself.');
  }

  private async role(db: Database, serverId: string, roleId: string): Promise<Role> {
    const {
      rows: [role],
    } = await db.query<Role>(
      `SELECT id, name, colour, position, permissions::int AS permissions, is_default AS "isDefault", hoist,
        description, icon_id AS "iconId", revision
      FROM roles WHERE id=$1 AND server_id=$2`,
      [roleId, serverId],
    );
    if (!role) throw new HttpError(404, 'Role not found.');
    return role;
  }

  private below(access: Access, role: Role, action: string): void {
    if (role.isDefault) return;
    if (role.position >= access.rank)
      throw new HttpError(403, `You can only ${action} roles below your highest role.`);
  }

  /** A new role starts at the bottom, just above @everyone, where anybody allowed to make it can reach it. */
  async create(userId: string, serverId: string, input: RoleInput): Promise<string> {
    return withServer(this.db, userId, serverId, async (db, access) => {
      requirePermission(access, Permission.ManageRoles, 'You need Manage roles to create a role.');
      this.checkGrant(access, 0, input.permissions);
      if (input.iconId) throw new HttpError(422, 'Create the role before uploading its icon.');
      const {
        rows: [count],
      } = await db.query<{ count: string }>('SELECT count(*) FROM roles WHERE server_id=$1', [serverId]);
      if (Number(count.count) >= 50) throw new HttpError(409, 'A server can have up to 50 roles.');
      await db.query('UPDATE roles SET position=position+1,revision=revision+1 WHERE server_id=$1 AND NOT is_default', [serverId]);
      const id = randomUUID();
      await db.query(
        'INSERT INTO roles(id, server_id, name, colour, position, permissions, hoist,description) VALUES($1,$2,$3,$4,1,$5,$6,$7)',
        [id, serverId, input.name, input.colour, input.permissions, input.hoist, input.description ?? ''],
      );
      return id;
    });
  }

  /** @everyone keeps its name and has no colour of its own; its permissions can change. */
  async update(userId: string, serverId: string, roleId: string, input: RolePatch): Promise<void> {
    await withServer(this.db, userId, serverId, async (db, access) => {
      requirePermission(access, Permission.ManageRoles, 'You need Manage roles to change a role.');
      const role = await this.role(db, serverId, roleId);
      this.below(access, role, 'change');
      if (input.expectedRevision !== undefined && input.expectedRevision !== role.revision)
        throw new HttpError(409, 'This role changed while you were editing. Review the latest version before saving.');
      const next = { ...role, ...input };
      this.checkGrant(access, role.permissions, next.permissions);
      if (role.isDefault && (input.iconId || input.description)) throw new HttpError(400, '@everyone has no custom icon or description.');
      if (input.iconId && input.iconId !== role.iconId) {
        const { rows } = await db.query(`SELECT 1 FROM role_image_uploads WHERE server_id=$1 AND role_id=$2 AND account_id=$3
          AND image_id=$4 AND created_at>now()-interval '24 hours'`, [serverId, roleId, userId, input.iconId]);
        if (!rows.length) throw new HttpError(422, 'Upload that role icon again before saving.');
      }
      if (role.isDefault)
        await db.query('UPDATE roles SET permissions=$2,revision=revision+1 WHERE id=$1', [roleId, next.permissions]);
      else
        await db.query('UPDATE roles SET name=$2, colour=$3, permissions=$4, hoist=$5,description=$6,icon_id=$7,revision=revision+1 WHERE id=$1', [
          roleId,
          next.name, next.colour, next.permissions, next.hoist, next.description ?? '', next.iconId ?? null,
        ]);
      if (input.iconId !== undefined) {
        if (input.iconId) await db.query('DELETE FROM role_image_uploads WHERE role_id=$1 AND account_id=$2 AND image_id=$3', [roleId, userId, input.iconId]);
        if (role.iconId !== input.iconId) await new ImageService(db).collect(role.iconId, db);
      }
    });
  }

  async remove(userId: string, serverId: string, roleId: string): Promise<void> {
    await withServer(this.db, userId, serverId, async (db, access) => {
      requirePermission(access, Permission.ManageRoles, 'You need Manage roles to delete a role.');
      const role = await this.role(db, serverId, roleId);
      if (role.isDefault) throw new HttpError(400, '@everyone cannot be deleted.');
      this.below(access, role, 'delete');
      const { rows: pending } = await db.query<{ imageId: string }>('SELECT image_id AS "imageId" FROM role_image_uploads WHERE role_id=$1', [roleId]);
      await db.query("DELETE FROM channel_overrides WHERE target_type='role' AND target_id=$1", [roleId]);
      await db.query("DELETE FROM category_overrides WHERE target_type='role' AND target_id=$1", [roleId]);
      await db.query('DELETE FROM roles WHERE id=$1', [roleId]);
      await new ImageService(db).collect(role.iconId, db);
      for (const image of pending) await new ImageService(db).collect(image.imageId, db);
      // Close the gap, so positions stay 1..n under whatever is left.
      await db.query(
        `UPDATE roles r SET position = ranked.position, revision=r.revision+1 FROM (
          SELECT id, row_number() OVER (ORDER BY position) AS position FROM roles WHERE server_id=$1 AND NOT is_default
        ) ranked WHERE r.id = ranked.id`,
        [serverId],
      );
      await pruneTags(db, serverId);
    });
  }

  /**
   * Puts the roles in a new order, highest first, @everyone left out. The
   * roles you cannot manage must stay exactly where they are; the rest may go
   * anywhere below your own highest role.
   */
  async reorder(userId: string, serverId: string, roleIds: string[], expectedOrder?: string[]): Promise<void> {
    await withServer(this.db, userId, serverId, async (db, access) => {
      requirePermission(access, Permission.ManageRoles, 'You need Manage roles to reorder roles.');
      const roles = access.roles.filter((role) => !role.isDefault);
      if (expectedOrder && JSON.stringify(expectedOrder) !== JSON.stringify([...roles].sort((a,b) => b.position-a.position).map((role) => role.id)))
        throw new HttpError(409, 'The role order changed. Refresh the list before reordering it.');
      if (roleIds.length !== roles.length || new Set(roleIds).size !== roles.length ||
        roleIds.some((id) => !roles.some((role) => role.id === id)))
        throw new HttpError(400, 'List every role of this server once.');
      const next = new Map(roleIds.map((id, index) => [id, roleIds.length - index]));
      if (!access.member.isOwner)
        for (const role of roles) {
          const position = next.get(role.id)!;
          if (role.position >= access.rank ? position !== role.position : position >= access.rank)
            throw new HttpError(403, 'You can only move roles below your highest role, and only below it.');
        }
      for (const [id, position] of next) await db.query('UPDATE roles SET position=$2,revision=revision+1 WHERE id=$1 AND position<>$2', [id, position]);
    });
  }

  /**
   * Gives somebody exactly these roles. Each role added or taken away must be
   * below the actor's highest, and the person must be the actor or below them.
   */
  async setMemberRoles(userId: string, serverId: string, targetId: string, roleIds: string[]): Promise<void> {
    await withServer(this.db, userId, serverId, async (db, access) => {
      requirePermission(access, Permission.ManageRoles, 'You need Manage roles to change somebody’s roles.');
      const target = await rankOf(db, access, targetId);
      if (targetId !== userId && !access.member.isOwner && (target.isOwner || target.rank >= access.rank))
        throw new HttpError(403, 'You can only change the roles of people below you.');
      const wanted = new Set(roleIds);
      for (const id of wanted) {
        const role = access.roles.find((entry) => entry.id === id);
        if (!role || role.isDefault) throw new HttpError(400, 'Those roles do not belong to this server.');
      }
      const { rows } = await db.query<{ roleId: string }>(
        'SELECT role_id AS "roleId" FROM member_roles WHERE server_id=$1 AND account_id=$2',
        [serverId, targetId],
      );
      const current = new Set(rows.map((row) => row.roleId));
      const changed = [...wanted].filter((id) => !current.has(id)).concat([...current].filter((id) => !wanted.has(id)));
      for (const id of changed) this.below(access, access.roles.find((role) => role.id === id)!, 'give or take away');
      for (const id of wanted) if (!current.has(id)) this.checkGrant(access, 0, access.roles.find((role) => role.id === id)!.permissions);
      await db.query('DELETE FROM member_roles WHERE server_id=$1 AND account_id=$2', [serverId, targetId]);
      for (const id of wanted)
        await db.query('INSERT INTO member_roles(server_id, account_id, role_id) VALUES($1,$2,$3)', [
          serverId,
          targetId,
          id,
        ]);
      await pruneTags(db, serverId);
    });
  }

  // ----------------------------------------------------- role customization
  async stageIcon(userId: string, serverId: string, roleId: string, bytes: Buffer): Promise<string> {
    return withServer(this.db, userId, serverId, async (db, access) => {
      requirePermission(access, Permission.ManageRoles, 'You need Manage roles to change an icon.');
      const role = await this.role(db, serverId, roleId);
      this.below(access, role, 'change');
      if (role.isDefault) throw new HttpError(400, '@everyone cannot have an icon.');
      if (bytes.length > 2_097_152) throw new HttpError(413, 'Choose an icon smaller than 2 MB.');
      const images = new ImageService(db);
      const { rows: expired } = await db.query<{ imageId: string }>(
        `DELETE FROM role_image_uploads WHERE server_id=$1 AND created_at<now()-interval '24 hours' RETURNING image_id AS "imageId"`, [serverId]);
      for (const image of expired) await images.collect(image.imageId, db);
      const { rows: [count] } = await db.query<{ count: string }>('SELECT count(*) FROM role_image_uploads WHERE role_id=$1 AND account_id=$2', [roleId, userId]);
      if (Number(count.count) >= 24) throw new HttpError(429, 'Too many pending icons. Save or try again tomorrow.');
      const imageId = await images.store(bytes, 'icon', db);
      await db.query(`INSERT INTO role_image_uploads(server_id,role_id,account_id,image_id) VALUES($1,$2,$3,$4)
        ON CONFLICT(role_id,account_id,image_id) DO UPDATE SET created_at=now()`, [serverId, roleId, userId, imageId]);
      return imageId;
    });
  }

  /** Add/remove one role without replacing a member's concurrently edited other roles. All targets succeed together. */
  async changeRoleMembers(userId: string, serverId: string, roleId: string, add: string[], remove: string[]): Promise<void> {
    await withServer(this.db, userId, serverId, async (db, access) => {
      requirePermission(access, Permission.ManageRoles, 'You need Manage roles to change role members.');
      const role = await this.role(db, serverId, roleId);
      if (role.isDefault) throw new HttpError(400, 'Every member holds @everyone automatically.');
      this.below(access, role, 'give or take away');
      const added = new Set(add), removed = new Set(remove);
      if ([...added].some((id) => removed.has(id))) throw new HttpError(400, 'A person cannot be added and removed together.');
      if (added.size) this.checkGrant(access, 0, role.permissions);
      for (const targetId of new Set([...added, ...removed])) {
        const target = await rankOf(db, access, targetId);
        if (targetId !== userId && !access.member.isOwner && (target.isOwner || target.rank >= access.rank))
          throw new HttpError(403, 'You can only change the roles of people below you.');
      }
      for (const targetId of added) await db.query(`INSERT INTO member_roles(server_id,account_id,role_id) VALUES($1,$2,$3)
        ON CONFLICT(account_id,role_id) DO NOTHING`, [serverId, targetId, roleId]);
      for (const targetId of removed) await db.query('DELETE FROM member_roles WHERE server_id=$1 AND account_id=$2 AND role_id=$3', [serverId, targetId, roleId]);
      if (removed.size) await pruneTags(db, serverId);
    });
  }

  // ------------------------------------------------------------ moderation
  /** A timeout, a server mute and a server deafen, each needing its own permission. */
  async moderate(userId: string, serverId: string, targetId: string, input: ModerationInput): Promise<void> {
    await withServer(this.db, userId, serverId, async (db, access) => {
      if (input.timeoutMinutes !== undefined) {
        requirePermission(access, Permission.TimeoutMembers, 'You need Timeout members to do that.');
        await requireAbove(db, access, targetId, 'time out');
        const until =
          input.timeoutMinutes === null ? null : new Date(Date.now() + input.timeoutMinutes * 60_000);
        await db.query('UPDATE memberships SET timeout_until=$3 WHERE server_id=$1 AND account_id=$2', [
          serverId,
          targetId,
          until,
        ]);
      }
      if (input.muted !== undefined) {
        requirePermission(access, Permission.MuteMembers, 'You need Mute members to do that.');
        await requireAbove(db, access, targetId, 'mute');
        await db.query('UPDATE memberships SET muted=$3 WHERE server_id=$1 AND account_id=$2', [
          serverId,
          targetId,
          input.muted,
        ]);
      }
      if (input.deafened !== undefined) {
        requirePermission(access, Permission.DeafenMembers, 'You need Deafen members to do that.');
        await requireAbove(db, access, targetId, 'deafen');
        await db.query('UPDATE memberships SET deafened=$3 WHERE server_id=$1 AND account_id=$2', [
          serverId,
          targetId,
          input.deafened,
        ]);
      }
    });
  }

  /**
   * Sends somebody below you to another voice channel of this server. The
   * destination must be one you may move people into and they may join; the
   * move itself is made by their own client, which joins it, so the service
   * only records where they were sent.
   */
  async move(
    userId: string,
    serverId: string,
    targetId: string,
    channelId: string,
    permissionsIn: (userId: string, channelId: string) => Promise<{ serverId: string; type: string; permissions: number }>,
  ): Promise<void> {
    // What each of them may do in the destination is read first, outside the
    // write, which then only has to judge the hierarchy and record the move.
    const mine = await permissionsIn(userId, channelId);
    if (mine.serverId !== serverId || mine.type !== 'voice') throw new HttpError(400, 'Choose a voice channel of this server.');
    if (!has(mine.permissions, Permission.MoveMembers))
      throw new HttpError(403, 'You need Move members in that channel to move people into it.');
    const theirs = await permissionsIn(targetId, channelId).catch(() => ({ permissions: 0 }));
    if (!has(theirs.permissions, Permission.Connect)) throw new HttpError(403, 'They cannot join that channel.');
    await withServer(this.db, userId, serverId, async (db, access) => {
      if (targetId !== userId) await requireAbove(db, access, targetId, 'move');
      await db.query('UPDATE memberships SET move_to=$3 WHERE server_id=$1 AND account_id=$2', [
        serverId,
        targetId,
        channelId,
      ]);
    });
  }

  /** Checks somebody may be taken out of a call; the call itself is the voice service's. */
  async checkDisconnect(userId: string, serverId: string, targetId: string): Promise<void> {
    const access = await loadAccess(this.db, userId, serverId);
    requirePermission(access, Permission.DisconnectMembers, 'You need Disconnect members to do that.');
    await requireAbove(this.db, access, targetId, 'disconnect');
  }

  async ban(userId: string, serverId: string, targetId: string, reason: string): Promise<void> {
    await withServer(this.db, userId, serverId, async (db, access) => {
      requirePermission(access, Permission.BanMembers, 'You need Ban members to ban somebody.');
      await requireAbove(db, access, targetId, 'ban');
      await CommunityService.removeMember(db, serverId, targetId);
      await db.query(
        `INSERT INTO bans(server_id, account_id, reason, banned_by) VALUES($1,$2,$3,$4)
        ON CONFLICT (server_id, account_id) DO UPDATE SET reason=EXCLUDED.reason, banned_by=EXCLUDED.banned_by`,
        [serverId, targetId, reason, userId],
      );
    });
  }

  async unban(userId: string, serverId: string, targetId: string): Promise<void> {
    await withServer(this.db, userId, serverId, async (db, access) => {
      requirePermission(access, Permission.BanMembers, 'You need Ban members to lift a ban.');
      await db.query('DELETE FROM bans WHERE server_id=$1 AND account_id=$2', [serverId, targetId]);
    });
  }

  async bans(userId: string, serverId: string): Promise<Ban[]> {
    requirePermission(
      await loadAccess(this.db, userId, serverId),
      Permission.BanMembers,
      'You need Ban members to see who is banned.',
    );
    return (
      await this.db.query<Ban>(
        `SELECT a.id AS "userId", a.username, a.display_name AS "displayName", a.avatar_id AS "avatarId",
          b.reason, b.created_at AS "createdAt"
        FROM bans b JOIN accounts a ON a.id=b.account_id WHERE b.server_id=$1 ORDER BY b.created_at DESC`,
        [serverId],
      )
    ).rows;
  }
}
