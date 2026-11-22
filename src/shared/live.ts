/**
 * The live connection between a client and its server.
 *
 * Events say that something changed and where, never what it now says. The
 * client reads the new state through the same endpoints it always used, so
 * every permission check stays in one place and an event can never carry
 * more than the person was allowed to read.
 */

export const livePath = '/api/live';

/** Closed for a session that is missing, expired or signed out: do not retry it. */
export const liveUnauthorized = 4001;
/** Closed for sending too much, too fast. */
export const liveTooChatty = 4008;

export type LiveEvent =
  /** Signed in; every event from here on is for this account. */
  | { type: 'ready' }
  /** The list of servers changed: one was made, joined, left or renamed. */
  | { type: 'servers' }
  /** Something in this server changed: channels, roles, members, settings. */
  | { type: 'server'; serverId: string }
  /** Who sits in this server's voice channels changed. */
  | { type: 'presence'; serverId: string }
  /** Messages in a watched channel changed; `authorId` when one was written. */
  | { type: 'channel'; channelId: string; authorId?: string }
  /** Somebody you share a server or a conversation with came or went. */
  | { type: 'status'; userId: string; online: boolean }
  /** Your conversations changed; `conversationId` when one in particular did. */
  | { type: 'directs'; conversationId?: string; authorId?: string }
  /** Somebody is writing, here and now. Repeated while they keep at it. */
  | {
      type: 'typing';
      channelId?: string;
      conversationId?: string;
      userId: string;
      name: string;
    };

export type LiveRequest =
  | { type: 'auth'; token: string }
  /** Asks for the events of a channel you can read, while it is on screen. */
  | { type: 'watch'; channelId: string }
  | { type: 'unwatch'; channelId: string }
  | { type: 'typing'; channelId: string }
  | { type: 'typing'; conversationId: string };

/** How long a typing signal holds without being repeated. */
export const typingHoldMs = 6_000;
/** How often a client repeats it while the person keeps typing. */
export const typingRepeatMs = 3_000;
