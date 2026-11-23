import { useSyncExternalStore } from 'react';
import {
  defaultPreferences,
  readPreferences,
  type NotificationPreferences,
  type NotifyLevel,
  type Viewing,
} from '../domain/notifications';

/**
 * Notification state for this window: the settings, where the reader is
 * looking, the mentions they have not seen yet, and a channel a notification
 * asked to open. Kept outside React because the root, the room and the
 * sidebar each hold a piece of it.
 */
class NotificationStore {
  private preferences: NotificationPreferences = { ...defaultPreferences, servers: {} };
  private accountId?: string;
  private channelId?: string;
  private conversationId?: string;
  private readonly mentions = new Map<string, { serverId: string; count: number }>();
  private request?: { serverId: string; channelId: string };
  private version = 0;
  private readonly listeners = new Set<() => void>();

  private key = () => `pulse-room:notifications:${this.accountId}`;

  public subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };
  public snapshot = () => this.version;

  private changed() {
    this.version++;
    this.listeners.forEach((listener) => listener());
  }

  /** Settings are per account: two people sharing a computer set their own. */
  public signIn(accountId: string | undefined) {
    if (accountId === this.accountId) return;
    this.accountId = accountId;
    this.mentions.clear();
    let stored: unknown;
    try {
      stored = accountId ? JSON.parse(localStorage.getItem(this.key()) ?? 'null') : null;
    } catch {
      stored = null;
    }
    this.preferences = readPreferences(stored);
    this.changed();
  }

  public get settings(): NotificationPreferences {
    return this.preferences;
  }

  public update(change: Partial<Omit<NotificationPreferences, 'servers'>>) {
    this.preferences = { ...this.preferences, ...change };
    this.save();
  }

  public setLevel(serverId: string, level: NotifyLevel) {
    this.preferences = { ...this.preferences, servers: { ...this.preferences.servers, [serverId]: level } };
    // Nothing is left to show for a server that was just silenced.
    if (level === 'nothing')
      for (const [id, entry] of this.mentions) if (entry.serverId === serverId) this.mentions.delete(id);
    this.save();
  }

  private save() {
    try {
      if (this.accountId) localStorage.setItem(this.key(), JSON.stringify(this.preferences));
    } catch {
      // Kept for this session only.
    }
    this.changed();
  }

  public viewing(): Viewing {
    return {
      channelId: this.channelId,
      conversationId: this.conversationId,
      focused:
        typeof document !== 'undefined' && document.hasFocus() && document.visibilityState === 'visible',
    };
  }

  /** The channel open in the room, or none while a conversation covers it. */
  public showChannel(channelId: string | undefined) {
    if (this.channelId === channelId) return;
    this.channelId = channelId;
    if (channelId && this.mentions.delete(channelId)) this.changed();
  }

  public showConversation(conversationId: string | undefined) {
    this.conversationId = conversationId;
  }

  public mentioned(serverId: string, channelId: string) {
    const entry = this.mentions.get(channelId) ?? { serverId, count: 0 };
    this.mentions.set(channelId, { serverId, count: entry.count + 1 });
    this.changed();
  }

  public mentionsIn(channelId: string): number {
    return this.mentions.get(channelId)?.count ?? 0;
  }

  public mentionsInServer(serverId: string): number {
    let total = 0;
    for (const entry of this.mentions.values()) if (entry.serverId === serverId) total += entry.count;
    return total;
  }

  /** A notification was clicked: the room opens this channel once its server is in. */
  public open(serverId: string, channelId: string) {
    this.request = { serverId, channelId };
    this.changed();
  }

  /** The channel asked for in this server, taken once. */
  public take(serverId: string): string | undefined {
    if (this.request?.serverId !== serverId) return undefined;
    const { channelId } = this.request;
    this.request = undefined;
    return channelId;
  }
}

export const notificationStore = new NotificationStore();

/** Re-renders whenever anything in the store changes. */
export function useNotificationStore() {
  useSyncExternalStore(notificationStore.subscribe, notificationStore.snapshot);
  return notificationStore;
}
