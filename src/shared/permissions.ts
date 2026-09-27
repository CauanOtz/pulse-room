/**
 * What a member may do, as one number: each permission is a bit.
 *
 * Roles add bits together; a channel can then allow or deny single bits for a
 * role or a person. Only permissions that gate something the application
 * actually does are here. A switch that does nothing would still be read as a
 * promise, so embeds, reactions, uploads, video and nicknames wait for the
 * features they would control.
 *
 * The numbers are stored, so a bit never changes meaning once it has shipped:
 * new permissions take new bits.
 */
export const Permission = {
  ViewChannels: 1 << 0,
  SendMessages: 1 << 1,
  CreateInvites: 1 << 2,
  Connect: 1 << 3,
  Speak: 1 << 4,
  ShareScreen: 1 << 5,
  MuteMembers: 1 << 6,
  DeafenMembers: 1 << 7,
  DisconnectMembers: 1 << 8,
  ManageMessages: 1 << 9,
  KickMembers: 1 << 10,
  BanMembers: 1 << 11,
  TimeoutMembers: 1 << 12,
  ManageChannels: 1 << 13,
  ManageRoles: 1 << 14,
  ManageTags: 1 << 15,
  ManageServer: 1 << 16,
  Administrator: 1 << 17,
  MoveMembers: 1 << 18,
} as const;
export type PermissionName = keyof typeof Permission;

/** Every bit this version knows. */
export const allPermissions = (1 << 19) - 1;

/** The bits a channel or a category can allow or deny. The rest are server-wide. */
export const channelScoped =
  Permission.ViewChannels |
  Permission.SendMessages |
  Permission.ManageMessages |
  Permission.Connect |
  Permission.Speak |
  Permission.ShareScreen |
  Permission.MuteMembers |
  Permission.DeafenMembers |
  Permission.DisconnectMembers |
  Permission.MoveMembers;

/**
 * What everybody may do in a new server: read, write, join a call, talk and
 * share. Nothing that acts on another person.
 */
export const everyoneDefault =
  Permission.ViewChannels |
  Permission.SendMessages |
  Permission.Connect |
  Permission.Speak |
  Permission.ShareScreen;

export interface PermissionInfo {
  flag: number;
  name: PermissionName;
  label: string;
  description: string;
  /** Only means something in a voice channel, or only in a text channel. */
  channelType?: 'text' | 'voice';
}

export const permissionGroups: { title: string; items: PermissionInfo[] }[] = [
  {
    title: 'General',
    items: [
      {
        flag: Permission.ViewChannels,
        name: 'ViewChannels',
        label: 'View channels',
        description: 'See the channel, read its messages and who is in its call.',
      },
      {
        flag: Permission.SendMessages,
        name: 'SendMessages',
        label: 'Send messages',
        description: 'Write in text channels.',
        channelType: 'text',
      },
      {
        flag: Permission.CreateInvites,
        name: 'CreateInvites',
        label: 'Create invitations',
        description: 'Make invite codes that let new people in.',
      },
    ],
  },
  {
    title: 'Voice',
    items: [
      {
        flag: Permission.Connect,
        name: 'Connect',
        label: 'Connect',
        description: 'Join the call in voice channels.',
        channelType: 'voice',
      },
      {
        flag: Permission.Speak,
        name: 'Speak',
        label: 'Speak',
        description: 'Use a microphone in the call.',
        channelType: 'voice',
      },
      {
        flag: Permission.ShareScreen,
        name: 'ShareScreen',
        label: 'Share screen',
        description: 'Share a screen and its sound with the call.',
        channelType: 'voice',
      },
      {
        flag: Permission.MuteMembers,
        name: 'MuteMembers',
        label: 'Mute members',
        description: 'Turn off somebody else’s microphone for this server.',
        channelType: 'voice',
      },
      {
        flag: Permission.DeafenMembers,
        name: 'DeafenMembers',
        label: 'Deafen members',
        description: 'Stop somebody else hearing calls in this server.',
        channelType: 'voice',
      },
      {
        flag: Permission.MoveMembers,
        name: 'MoveMembers',
        label: 'Move members',
        description: 'Move somebody from their call into another voice channel.',
        channelType: 'voice',
      },
      {
        flag: Permission.DisconnectMembers,
        name: 'DisconnectMembers',
        label: 'Disconnect members',
        description: 'Take somebody out of the call they are in.',
        channelType: 'voice',
      },
    ],
  },
  {
    title: 'Moderation',
    items: [
      {
        flag: Permission.ManageMessages,
        name: 'ManageMessages',
        label: 'Manage messages',
        description: 'Delete messages other people wrote.',
        channelType: 'text',
      },
      {
        flag: Permission.KickMembers,
        name: 'KickMembers',
        label: 'Kick members',
        description: 'Remove somebody; they can come back with a new invitation.',
      },
      {
        flag: Permission.BanMembers,
        name: 'BanMembers',
        label: 'Ban members',
        description: 'Remove somebody and refuse every invitation they try.',
      },
      {
        flag: Permission.TimeoutMembers,
        name: 'TimeoutMembers',
        label: 'Timeout members',
        description: 'Stop somebody writing, speaking and sharing for a while.',
      },
    ],
  },
  {
    title: 'Management',
    items: [
      {
        flag: Permission.ManageChannels,
        name: 'ManageChannels',
        label: 'Manage channels',
        description: 'Create, edit and delete channels and categories, and their permissions.',
      },
      {
        flag: Permission.ManageRoles,
        name: 'ManageRoles',
        label: 'Manage roles',
        description: 'Create and edit roles below their own, and give them to members.',
      },
      {
        flag: Permission.ManageTags,
        name: 'ManageTags',
        label: 'Manage tags',
        description: 'Create and edit the server’s tags, and hand out the ones staff assign.',
      },
      {
        flag: Permission.ManageServer,
        name: 'ManageServer',
        label: 'Manage server',
        description: 'Change the name and picture, and see and revoke invitations.',
      },
    ],
  },
];

export const administratorInfo: PermissionInfo = {
  flag: Permission.Administrator,
  name: 'Administrator',
  label: 'Administrator',
  description: 'Grants every permission and bypasses channel restrictions.',
};

export const has = (permissions: number, flag: number): boolean => (permissions & flag) === flag;

export interface RoleShape {
  id: string;
  position: number;
  permissions: number;
  isDefault: boolean;
}

export interface MemberShape {
  id: string;
  isOwner: boolean;
  roleIds: readonly string[];
}

/** An allow or a deny on a channel or a category, for one role or one person. */
export interface PermissionOverride {
  targetType: 'role' | 'member';
  targetId: string;
  allow: number;
  deny: number;
}

/**
 * Where somebody stands. The owner is above every role; everybody else stands
 * as high as their highest role, and @everyone is the floor at zero.
 */
export function rank(member: MemberShape, roles: readonly RoleShape[]): number {
  if (member.isOwner) return Number.POSITIVE_INFINITY;
  let highest = 0;
  for (const role of roles) if (member.roleIds.includes(role.id) && role.position > highest) highest = role.position;
  return highest;
}

/** What somebody may do anywhere in the server, before any channel has a say. */
export function serverPermissions(member: MemberShape, roles: readonly RoleShape[]): number {
  if (member.isOwner) return allPermissions;
  let permissions = 0;
  for (const role of roles) if (role.isDefault || member.roleIds.includes(role.id)) permissions |= role.permissions;
  return has(permissions, Permission.Administrator) ? allPermissions : permissions;
}

/**
 * What somebody may do in one channel. The order is fixed and is the whole of
 * the rule: @everyone's override first, then every one of their roles' together
 * (a deny from one role is lifted by an allow from another), then their own.
 * An owner or an administrator is never restricted. Without sight of a channel
 * nothing else in it applies.
 */
export function channelPermissionsFor(
  member: MemberShape,
  roles: readonly RoleShape[],
  overrides: readonly PermissionOverride[],
): number {
  let permissions = serverPermissions(member, roles);
  if (has(permissions, Permission.Administrator)) return allPermissions;
  const everyone = roles.find((role) => role.isDefault);
  const everyoneOverride = overrides.find(
    (override) => override.targetType === 'role' && override.targetId === everyone?.id,
  );
  if (everyoneOverride) permissions = (permissions & ~everyoneOverride.deny) | everyoneOverride.allow;
  let allow = 0;
  let deny = 0;
  for (const override of overrides)
    if (override.targetType === 'role' && override.targetId !== everyone?.id && member.roleIds.includes(override.targetId)) {
      allow |= override.allow;
      deny |= override.deny;
    }
  permissions = (permissions & ~deny) | allow;
  const own = overrides.find((override) => override.targetType === 'member' && override.targetId === member.id);
  if (own) permissions = (permissions & ~own.deny) | own.allow;
  return has(permissions, Permission.ViewChannels) ? permissions : 0;
}

/**
 * What a timeout, a server mute or a server deafen takes away on top. A person
 * in a timeout can still read and listen; they cannot write, talk or share.
 */
export function restrict(
  permissions: number,
  state: { timedOut?: boolean; muted?: boolean },
): number {
  let result = permissions;
  if (state.timedOut) result &= ~(Permission.SendMessages | Permission.Speak | Permission.ShareScreen);
  if (state.muted) result &= ~Permission.Speak;
  return result;
}

/** Names for a set of bits, in the order the editor shows them. */
export function describe(permissions: number): string[] {
  if (has(permissions, Permission.Administrator)) return [administratorInfo.label];
  return permissionGroups.flatMap((group) =>
    group.items.filter((item) => has(permissions, item.flag)).map((item) => item.label),
  );
}
