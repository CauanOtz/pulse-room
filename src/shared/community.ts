export type MemberRole = 'owner' | 'admin' | 'member';
export interface Account {
  id: string;
  username: string;
  displayName: string;
  /** Content address of the picture, fetched from /api/images. */
  avatarId?: string | null;
}
export interface Community {
  id: string;
  name: string;
  role: MemberRole;
  iconId?: string | null;
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
