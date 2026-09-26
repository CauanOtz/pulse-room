import type { CommunityDetail, CommunityMember, Role } from '../../shared/community';
import {
  allPermissions,
  everyoneDefault,
  has,
  Permission,
  rank,
  type MemberShape,
} from '../../shared/permissions';

/** Where you stand in the open server, for deciding which controls to draw. */
export interface MyAccess {
  permissions: number;
  rank: number;
  isOwner: boolean;
  isAdministrator: boolean;
  can(flag: number): boolean;
}

export const shapeOf = (member: Pick<CommunityMember, 'id' | 'role' | 'roleIds'>): MemberShape => ({
  id: member.id,
  isOwner: member.role === 'owner',
  roleIds: member.roleIds ?? [],
});

/**
 * The service has already worked out what you may do; this only reads it. A
 * service from before roles did not say, so the fixed standing stands in.
 */
export function myAccess(detail: CommunityDetail, userId: string): MyAccess {
  const me = detail.members.find((member) => member.id === userId);
  const isOwner = detail.server.role === 'owner';
  const permissions =
    detail.server.permissions ?? (isOwner || detail.server.role === 'admin' ? allPermissions : everyoneDefault);
  return {
    permissions,
    rank: rank({ id: userId, isOwner, roleIds: me?.roleIds ?? [] }, detail.roles ?? []),
    isOwner,
    isAdministrator: has(permissions, Permission.Administrator),
    can: (flag) => has(permissions, flag),
  };
}

/** Whether you may act on this person: somebody else, below you, and never the owner. */
export function outranks(access: MyAccess, detail: CommunityDetail, member: CommunityMember, userId: string): boolean {
  if (member.id === userId || member.role === 'owner') return false;
  return rank(shapeOf(member), detail.roles ?? []) < access.rank;
}

/** Whether you may edit or hand out this role. @everyone counts as below everybody. */
export const canTouchRole = (access: MyAccess, role: Role): boolean =>
  access.isOwner || role.isDefault || role.position < access.rank;

/** A member's roles, highest first, @everyone left out. */
export function rolesOf(detail: CommunityDetail, member: Pick<CommunityMember, 'roleIds'>): Role[] {
  return (detail.roles ?? [])
    .filter((role) => !role.isDefault && member.roleIds?.includes(role.id))
    .sort((a, b) => b.position - a.position);
}
