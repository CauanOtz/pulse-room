/**
 * What is worth interrupting somebody for. Per server, the way a group chat
 * is set: every message, only the ones that name you, or nothing at all.
 * Direct messages have a switch of their own, and the whole thing can be
 * kept silent or kept off the desktop on this computer.
 */
export type NotifyLevel = 'all' | 'mentions' | 'nothing';

export interface NotificationPreferences {
  /** Show the system's own notification, outside the window. */
  desktop: boolean;
  /** A short chime with each one. */
  sound: boolean;
  /** Direct messages notify, whatever the servers are set to. */
  directs: boolean;
  /** Per server; a server not listed follows `defaultLevel`. */
  servers: Record<string, NotifyLevel>;
}

/** Mentions only: a group of friends talks a lot, and most of it is not for you. */
export const defaultLevel: NotifyLevel = 'mentions';

export const defaultPreferences: NotificationPreferences = {
  desktop: true,
  sound: true,
  directs: true,
  servers: {},
};

export const levelOf = (preferences: NotificationPreferences, serverId: string): NotifyLevel =>
  preferences.servers[serverId] ?? defaultLevel;

export interface Viewing {
  channelId?: string;
  conversationId?: string;
  /** The window has the keyboard: somebody is at it. */
  focused: boolean;
}

/** Whether a message in a channel calls for a notification, by these settings. */
export function notifiesForMessage(
  message: { serverId: string; channelId: string; mentioned: boolean },
  preferences: NotificationPreferences,
  viewing: Viewing,
): boolean {
  if (viewing.focused && viewing.channelId === message.channelId) return false;
  const level = levelOf(preferences, message.serverId);
  return level === 'all' || (level === 'mentions' && message.mentioned);
}

/** Whether a mention leaves a badge: muting a server mutes its badges too. */
export function badgesForMessage(
  message: { serverId: string; channelId: string; mentioned: boolean },
  preferences: NotificationPreferences,
  viewing: Viewing,
): boolean {
  return (
    message.mentioned &&
    levelOf(preferences, message.serverId) !== 'nothing' &&
    viewing.channelId !== message.channelId
  );
}

export function notifiesForDirect(
  conversationId: string,
  preferences: NotificationPreferences,
  viewing: Viewing,
): boolean {
  return preferences.directs && !(viewing.focused && viewing.conversationId === conversationId);
}

/** A stored copy, kept only where it makes sense: it was written by an older version or by hand. */
export function readPreferences(value: unknown): NotificationPreferences {
  if (!value || typeof value !== 'object') return { ...defaultPreferences, servers: {} };
  const stored = value as Partial<Record<keyof NotificationPreferences, unknown>>;
  const flag = (key: 'desktop' | 'sound' | 'directs') =>
    typeof stored[key] === 'boolean' ? (stored[key] as boolean) : defaultPreferences[key];
  const servers: Record<string, NotifyLevel> = {};
  if (stored.servers && typeof stored.servers === 'object')
    for (const [serverId, level] of Object.entries(stored.servers))
      if (level === 'all' || level === 'mentions' || level === 'nothing') servers[serverId] = level;
  return { desktop: flag('desktop'), sound: flag('sound'), directs: flag('directs'), servers };
}
