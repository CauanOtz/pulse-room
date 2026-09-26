import { describe, expect, it } from 'vitest';
import {
  allPermissions,
  channelPermissionsFor,
  describe as describePermissions,
  everyoneDefault,
  has,
  Permission,
  rank,
  restrict,
  serverPermissions,
  type PermissionOverride,
  type RoleShape,
} from '../../src/shared/permissions';

const everyone: RoleShape = { id: 'everyone', position: 0, permissions: everyoneDefault, isDefault: true };
const member: RoleShape = { id: 'member', position: 1, permissions: Permission.CreateInvites, isDefault: false };
const moderator: RoleShape = {
  id: 'mod',
  position: 2,
  permissions: Permission.ManageMessages | Permission.TimeoutMembers,
  isDefault: false,
};
const admin: RoleShape = { id: 'admin', position: 3, permissions: Permission.Administrator, isDefault: false };
const roles = [everyone, member, moderator, admin];

const person = (roleIds: string[], isOwner = false) => ({ id: 'p', isOwner, roleIds });
const role = (targetId: string, allow: number, deny: number): PermissionOverride => ({
  targetType: 'role',
  targetId,
  allow,
  deny,
});

describe('server permissions', () => {
  it('adds up every role somebody holds, @everyone included', () => {
    const permissions = serverPermissions(person(['member', 'mod']), roles);
    expect(has(permissions, Permission.SendMessages)).toBe(true);
    expect(has(permissions, Permission.CreateInvites)).toBe(true);
    expect(has(permissions, Permission.ManageMessages)).toBe(true);
    expect(has(permissions, Permission.KickMembers)).toBe(false);
  });

  it('gives Administrator every permission, and the owner too without any role', () => {
    expect(serverPermissions(person(['admin']), roles)).toBe(allPermissions);
    expect(serverPermissions(person([], true), roles)).toBe(allPermissions);
  });

  it('ranks the owner above everything and everybody else by their highest role', () => {
    expect(rank(person([], true), roles)).toBe(Number.POSITIVE_INFINITY);
    expect(rank(person(['member', 'mod']), roles)).toBe(2);
    expect(rank(person([]), roles)).toBe(0);
  });
});

describe('channel permissions', () => {
  it('lets a role allow back what @everyone was denied', () => {
    const overrides = [role('everyone', 0, Permission.ViewChannels), role('mod', Permission.ViewChannels, 0)];
    expect(channelPermissionsFor(person(['member']), roles, overrides)).toBe(0);
    expect(has(channelPermissionsFor(person(['mod']), roles, overrides), Permission.ViewChannels)).toBe(true);
  });

  it('lets an allow from one role beat a deny from another', () => {
    const overrides = [role('member', 0, Permission.SendMessages), role('mod', Permission.SendMessages, 0)];
    expect(has(channelPermissionsFor(person(['member', 'mod']), roles, overrides), Permission.SendMessages)).toBe(
      true,
    );
    expect(has(channelPermissionsFor(person(['member']), roles, overrides), Permission.SendMessages)).toBe(false);
  });

  it('puts a person’s own override last, above every role', () => {
    const overrides: PermissionOverride[] = [
      role('mod', Permission.SendMessages, 0),
      { targetType: 'member', targetId: 'p', allow: 0, deny: Permission.SendMessages },
    ];
    expect(has(channelPermissionsFor(person(['mod']), roles, overrides), Permission.SendMessages)).toBe(false);
  });

  it('never restricts an administrator or the owner', () => {
    const locked = [role('everyone', 0, Permission.ViewChannels), role('admin', 0, Permission.ViewChannels)];
    expect(channelPermissionsFor(person(['admin']), roles, locked)).toBe(allPermissions);
    expect(channelPermissionsFor(person([], true), roles, locked)).toBe(allPermissions);
  });

  it('takes everything away with sight of the channel', () => {
    const blind = [role('everyone', Permission.SendMessages, Permission.ViewChannels)];
    expect(channelPermissionsFor(person([]), roles, blind)).toBe(0);
  });

  it('leaves what nobody set to the roles, which is what "inherit" means', () => {
    expect(channelPermissionsFor(person(['member']), roles, [])).toBe(serverPermissions(person(['member']), roles));
  });
});

describe('restrictions', () => {
  it('keeps a person in a timeout reading and listening, and nothing else', () => {
    const permissions = restrict(everyoneDefault, { timedOut: true });
    expect(has(permissions, Permission.ViewChannels)).toBe(true);
    expect(has(permissions, Permission.Connect)).toBe(true);
    expect(has(permissions, Permission.SendMessages)).toBe(false);
    expect(has(permissions, Permission.Speak)).toBe(false);
    expect(has(permissions, Permission.ShareScreen)).toBe(false);
  });

  it('takes only the microphone for a server mute', () => {
    const permissions = restrict(everyoneDefault, { muted: true });
    expect(has(permissions, Permission.Speak)).toBe(false);
    expect(has(permissions, Permission.SendMessages)).toBe(true);
  });

  it('describes Administrator as itself rather than as every permission', () => {
    expect(describePermissions(allPermissions)).toEqual(['Administrator']);
    expect(describePermissions(Permission.SendMessages | Permission.Speak)).toEqual(['Send messages', 'Speak']);
  });
});
