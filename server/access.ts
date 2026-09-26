import type { MemberRole, Role } from '../src/shared/community.js';
import {
  channelPermissionsFor,
  has,
  Permission,
  rank,
  restrict,
  serverPermissions,
  type MemberShape,
  type PermissionOverride,
} from '../src/shared/permissions.js';
import type { Database } from './database.js';
import { HttpError } from './security.js';

export const roleColumns = `r.id, r.name, r.colour, r.position, r.permissions::int AS permissions,
  r.is_default AS "isDefault", r.hoist`;

/** Where one person stands in one server, read once per request. */
export interface Access {
  serverId: string;
  member: MemberShape;
  roles: Role[];
  /** Server-wide permissions, a timeout or mute already taken off. */
  permissions: number;
  rank: number;
  timedOut: boolean;
  muted: boolean;
  deafened: boolean;
}

export async function loadRoles(db: Database, serverId: string): Promise<Role[]> {
  return (
    await db.query<Role>(`SELECT ${roleColumns} FROM roles r WHERE r.server_id=$1 ORDER BY r.position DESC`, [
      serverId,
    ])
  ).rows;
}

/** 404 for somebody who is not in the server, so a guessed id tells nothing. */
export async function loadAccess(db: Database, userId: string, serverId: string): Promise<Access> {
  const {
    rows: [membership],
  } = await db.query<{ role: MemberRole; timedOut: boolean; muted: boolean; deafened: boolean }>(
    `SELECT role, COALESCE(timeout_until > now(), false) AS "timedOut", muted, deafened
    FROM memberships WHERE server_id=$1 AND account_id=$2`,
    [serverId, userId],
  );
  if (!membership) throw new HttpError(404, 'Server not found or access denied.');
  const roles = await loadRoles(db, serverId);
  const { rows } = await db.query<{ roleId: string }>(
    'SELECT role_id AS "roleId" FROM member_roles WHERE server_id=$1 AND account_id=$2',
    [serverId, userId],
  );
  const member: MemberShape = { id: userId, isOwner: membership.role === 'owner', roleIds: rows.map((row) => row.roleId) };
  return {
    serverId,
    member,
    roles,
    permissions: restrict(serverPermissions(member, roles), { timedOut: membership.timedOut, muted: membership.muted }),
    rank: rank(member, roles),
    timedOut: membership.timedOut,
    muted: membership.muted,
    deafened: membership.deafened,
  };
}

/**
 * One write to a server, start to finish, with the server row locked so two
 * people changing it at once are put in a line, and the actor's standing read
 * inside the same transaction as the change it permits.
 */
export async function withServer<T>(
  database: Database,
  userId: string,
  serverId: string,
  action: (db: Database, access: Access) => Promise<T>,
): Promise<T> {
  return database.transaction(async (db) => {
    await db.query('SELECT id FROM communities WHERE id=$1 FOR UPDATE', [serverId]);
    return action(db, await loadAccess(db, userId, serverId));
  });
}

/** What this person may do in a channel whose overrides are these. */
export function inChannel(access: Access, overrides: readonly PermissionOverride[]): number {
  return restrict(channelPermissionsFor(access.member, access.roles, overrides), {
    timedOut: access.timedOut,
    muted: access.muted,
  });
}

/** The standing an older client understands, worked out from roles. */
export function legacyRole(access: Pick<Access, 'member' | 'roles'>): MemberRole {
  if (access.member.isOwner) return 'owner';
  return has(serverPermissions(access.member, access.roles), Permission.Administrator) ? 'admin' : 'member';
}

export function requirePermission(access: Access, flag: number, message: string): void {
  if (!has(access.permissions, flag)) throw new HttpError(403, message);
}

/** The rank of somebody else in the same server, for the hierarchy checks. */
export async function rankOf(db: Database, access: Access, userId: string): Promise<{ rank: number; isOwner: boolean }> {
  const {
    rows: [membership],
  } = await db.query<{ role: MemberRole }>('SELECT role FROM memberships WHERE server_id=$1 AND account_id=$2', [
    access.serverId,
    userId,
  ]);
  if (!membership) throw new HttpError(404, 'That person is not in this server.');
  const { rows } = await db.query<{ roleId: string }>(
    'SELECT role_id AS "roleId" FROM member_roles WHERE server_id=$1 AND account_id=$2',
    [access.serverId, userId],
  );
  const member = { id: userId, isOwner: membership.role === 'owner', roleIds: rows.map((row) => row.roleId) };
  return { rank: rank(member, access.roles), isOwner: member.isOwner };
}

/**
 * Acting on another person needs a higher place than theirs. Nobody acts on the
 * owner, and nobody acts on themselves through a moderation action.
 */
export async function requireAbove(db: Database, access: Access, userId: string, action: string): Promise<void> {
  if (userId === access.member.id) throw new HttpError(403, `You cannot ${action} yourself.`);
  const target = await rankOf(db, access, userId);
  if (target.isOwner) throw new HttpError(403, `Nobody can ${action} the owner.`);
  if (target.rank >= access.rank)
    throw new HttpError(403, `You can only ${action} people whose highest role is below yours.`);
}
