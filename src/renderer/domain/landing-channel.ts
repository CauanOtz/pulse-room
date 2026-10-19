import type { CommunityDetail } from '../../shared/community';

/** Detail contains only accessible channels. A deleted or restricted destination falls back safely. */
export const landingChannel = (detail: CommunityDetail) =>
  detail.channels.find(
    (channel) => channel.type === 'text' && channel.id === detail.server.landingChannelId,
  ) ?? detail.channels.find((channel) => channel.type === 'text');
