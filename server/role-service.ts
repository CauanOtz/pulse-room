import { randomUUID } from 'node:crypto';
import type { Ban, Role } from '../src/shared/community.js';
import { allPermissions, has, Permission } from '../src/shared/permissions.js';
import { loadAccess, rankOf, requireAbove, requirePermission, withServer, type Access } from './access.js';
import { CommunityService } from './community-service.js';
import type { Database } from './database.js';
import { HttpError } from './security.js';
import { pruneTags } from './tag-service.js';

export interface RoleInput {
  name: string;
  colour: string | null;
  permissions: number;
  hoist: boolean;
}

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
      `SELECT id, name, colour, position, permissions::int AS permissions, is_default AS "isDefault", hoist
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
      const {
        rows: [count],
      } = await db.query<{ count: string }>('SELECT count(*) FROM roles WHERE server_id=$1', [serverId]);
      if (Number(count.count) >= 50) throw new HttpError(409, 'A server can have up to 50 roles.');
      await db.query('UPDATE roles SET position=position+1 WHERE server_id=$1 AND NOT is_default', [serverId]);
      const id = randomUUID();
      await db.query(
        'INSERT INTO roles(id, server_id, name, colour, position, permissions, hoist) VALUES($1,$2,$3,$4,1,$5,$6)',
        [id, serverId, input.name, input.colour, input.permissions, input.hoist],
      );
      return id;
    });
  }

  /** @everyone keeps its name and has no colour of its own; its permissions can change. */
  async update(userId: string, serverId: string, roleId: string, input: RoleInput): Promise<void> {
    await withServer(this.db, userId, serverId, async (db, access) => {
      requirePermission(access, Permission.ManageRoles, 'You need Manage roles to change a role.');
      const role = await this.role(db, serverId, roleId);
      this.below(access, role, 'change');
      this.checkGrant(access, role.permissions, input.permissions);
      if (role.isDefault)
        await db.query('UPDATE roles SET permissions=$2 WHERE id=$1', [roleId, input.permissions]);
      else
        await db.query('UPDATE roles SET name=$2, colour=$3, permissions=$4, hoist=$5 WHERE id=$1', [
          roleId,
          input.name,
          input.colour,
          input.permissions,
          input.hoist,
        ]);
    });
  }

  async remove(userId: string, serverId: string, roleId: string): Promise<void> {
    await withServer(this.db, userId, serverId, async (db, access) => {
      requirePermission(access, Permission.ManageRoles, 'You need Manage roles to delete a role.');
      const role = await this.role(db, serverId, roleId);
      if (role.isDefault) throw new HttpError(400, '@everyone cannot be deleted.');
      this.below(access, role, 'delete');
      await db.query("DELETE FROM channel_overrides WHERE target_type='role' AND target_id=$1", [roleId]);
      await db.query("DELETE FROM category_overrides WHERE target_type='role' AND target_id=$1", [roleId]);
      await db.query('DELETE FROM roles WHERE id=$1', [roleId]);
      // Close the gap, so positions stay 1..n under whatever is left.
      await db.query(
        `UPDATE roles r SET position = ranked.position FROM (
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
  async reorder(userId: string, serverId: string, roleIds: string[]): Promise<void> {
    await withServer(this.db, userId, serverId, async (db, access) => {
      requirePermission(access, Permission.ManageRoles, 'You need Manage roles to reorder roles.');
      const roles = access.roles.filter((role) => !role.isDefault);
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
      for (const [id, position] of next) await db.query('UPDATE roles SET position=$2 WHERE id=$1', [id, position]);
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
