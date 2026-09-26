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
  iconId?: string | null;
  /** The tag this server offers its members, if it has one. */
  tag?: ServerTag | null;
}
export interface CommunityMember extends Account {
  role: MemberRole;
}
export interface CommunityChannel {
  id: string;
  serverId: string;
  name: string;
  type: 'text' | 'voice';
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
