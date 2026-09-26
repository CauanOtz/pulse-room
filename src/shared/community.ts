import type { PermissionOverride } from './permissions.js';

/**
 * The three standings an older client understands. The service works it out
 * from roles for them: the owner, anybody holding Administrator, and everybody
 * else. Nothing in this version decides anything by it.
 */
export type MemberRole = 'owner' | 'admin' | 'member';

/** A colour as the service stores it: six lowercase hex digits after a hash. */
export const colourPattern = /^#[0-9a-f]{6}$/;

/**
 * The two colours a profile is painted in. The card is drawn as a gradient
 * from one to the other, the way a banner is when there is no picture.
 */
export interface ProfileTheme {
  primary: string;
  accent: string;
}

/** The glyphs a server can put beside its tag. Kept short on purpose. */
export const tagBadges = [
  'spark',
  'heart',
  'star',
  'moon',
  'flame',
  'leaf',
  'bolt',
  'crown',
  'skull',
  'gem',
  'music',
  'gamepad',
] as const;
export type TagBadge = (typeof tagBadges)[number];

/** One to four letters or digits, the way a server tag is written. */
export const tagTextPattern = /^[A-Za-z0-9]{1,4}$/;

/**
 * A short name a server gives itself. Members of the server can choose to
 * wear it beside their own name, everywhere they appear.
 */
export interface ServerTag {
  text: string;
  badge: TagBadge;
  colour: string;
}

/** A tag somebody is wearing, and the server it belongs to. */
export interface WornTag extends ServerTag {
  serverId: string;
  serverName: string;
}

/**
 * Who may wear a tag: anybody in the server, anybody holding one of its roles,
 * or only the people staff hand it to. A tag grants nothing; it is only worn.
 */
export type TagMode = 'everyone' | 'roles' | 'assigned';
export const tagModes: readonly TagMode[] = ['everyone', 'roles', 'assigned'];

/** One of a server's tags, as the people who manage them see it. */
export interface ServerTagDefinition extends ServerTag {
  id: string;
  /** What the tag stands for, shown beside it when it is chosen. */
  name: string;
  mode: TagMode;
  roleIds: string[];
  /** Who staff have handed an assigned tag to. */
  holderIds: string[];
}

/** The tags you may wear in one server, and the one you do. */
export interface TagChoice {
  serverId: string;
  serverName: string;
  tags: (ServerTag & { id: string; name: string })[];
  activeId: string | null;
}

/**
 * What a member may do in a server, gathered under a name. Roles stack: a
 * person holds every permission any of their roles holds. Their highest role
 * is where they stand, and they can only act on the people and roles below it.
 */
export interface Role {
  id: string;
  name: string;
  colour: string | null;
  /** Higher stands above lower. @everyone is 0 and always last. */
  position: number;
  permissions: number;
  /** @everyone: every member holds it and it cannot be removed. */
  isDefault: boolean;
  /** Its members are listed under it rather than among everybody else. */
  hoist: boolean;
}

export interface Category {
  id: string;
  name: string;
  overrides: PermissionOverride[];
}

export interface Ban {
  userId: string;
  username: string;
  displayName: string;
  avatarId: string | null;
  reason: string;
  createdAt: string;
}

export interface Account {
  id: string;
  username: string;
  displayName: string;
  /** Short profile text shown to other members of shared servers. */
  bio?: string;
  /** Content address of the picture, fetched from /api/images. */
  avatarId?: string | null;
  /** A wide picture across the top of the profile card. */
  bannerId?: string | null;
  /** Absent means the application's own colours. */
  theme?: ProfileTheme | null;
  /**
   * The server tag this person wears. It disappears on its own if they leave
   * that server or the server stops having a tag.
   */
  tag?: WornTag | null;
}
export interface Community {
  id: string;
  name: string;
  role: MemberRole;
  /** Everything you may do in this server, before any channel has a say. */
  permissions?: number;
  iconId?: string | null;
  /** The server's first tag, for clients that knew only one. */
  tag?: ServerTag | null;
}
export interface CommunityMember extends Account {
  role: MemberRole;
  /** Their roles here, @everyone left out since everybody holds it. */
  roleIds?: string[];
  /** Until when they may not write, speak or share. */
  timeoutUntil?: string | null;
  muted?: boolean;
  deafened?: boolean;
}
export interface CommunityChannel {
  id: string;
  serverId: string;
  name: string;
  type: 'text' | 'voice';
  categoryId?: string | null;
  /** Following its category's permissions rather than keeping its own. */
  synced?: boolean;
  /** What you may do in this channel. */
  permissions?: number;
  /** The channel's own allows and denies; only for those who manage channels. */
  overrides?: PermissionOverride[];
  /**
   * The switches older clients read, worked out for the person asking:
   * whether @everyone is kept out, who is let in by name, and whether they
   * themselves may speak, share and write.
   */
  private: boolean;
  memberIds: string[];
  allowSpeak: boolean;
  allowShare: boolean;
  readOnly: boolean;
}
export interface ChatMessage {
  id: string;
  channelId: string;
  authorId: string;
  authorName: string;
  content: string;
  createdAt: string;
}
export interface CommunityDetail {
  server: Community;
  channels: CommunityChannel[];
  members: CommunityMember[];
  roles?: Role[];
  categories?: Category[];
  tags?: ServerTagDefinition[];
}
export interface CommunityInvite {
  id: string;
  expiresAt: string;
  uses: number;
  maxUses: number;
}
export interface AccountSession {
  token: string;
  user: Account;
  recoveryCode?: string;
}
export const canManage = (role?: MemberRole): boolean => role === 'owner' || role === 'admin';
