import websocket from '@fastify/websocket';
import type { FastifyInstance } from 'fastify';
import type { WebSocket } from 'ws';
import { z } from 'zod';
import {
  liveTooChatty,
  liveUnauthorized,
  livePath,
  typingRepeatMs,
  type LiveEvent,
} from '../src/shared/live.js';

/** Who a connection belongs to, once it has signed in. */
export interface LiveAccount {
  id: string;
  sessionId: string;
  displayName: string;
}

/** The questions the hub asks of the rest of the server; each throws for "no". */
export interface LiveAccess {
  authenticate(token: string): Promise<LiveAccount>;
  /** Whether the session is still signed in and the account not suspended. */
  sessionAlive(sessionId: string): Promise<boolean>;
  canRead(userId: string, channelId: string): Promise<void>;
  canWrite(userId: string, channelId: string): Promise<void>;
  /** The other person in a conversation this account takes part in. */
  peerOf(userId: string, conversationId: string): Promise<string>;
}

interface Connection {
  socket: WebSocket;
  account?: LiveAccount;
  channels: Set<string>;
  alive: boolean;
  checkedAt: number;
  /** Requests in the current window, for the flood limit. */
  budget: { start: number; used: number };
  /** Where this connection last said it was typing, and when. */
  typedAt: Map<string, number>;
  /** Places this connection may type, and until when that answer holds. */
  mayType: Map<string, { until: number; peerId?: string }>;
  /** Requests are answered in the order they came, so a watch after sign-in sees the sign-in. */
  queue: Promise<void>;
}

const request = z.discriminatedUnion('type', [
  z.object({ type: z.literal('auth'), token: z.string().min(1).max(256) }),
  z.object({ type: z.literal('watch'), channelId: z.uuid() }),
  z.object({ type: z.literal('unwatch'), channelId: z.uuid() }),
  z.object({ type: z.literal('typing'), channelId: z.uuid().optional(), conversationId: z.uuid().optional() }),
]);

export const liveLimits = {
  /** Time a new connection has to sign in. */
  authMs: 10_000,
  /** Between pings; a connection that misses one is dropped. */
  heartbeatMs: 30_000,
  /** How often a connection's session is checked again. */
  recheckMs: 5 * 60_000,
  /** Requests a connection may make in one window. */
  requests: 40,
  windowMs: 10_000,
  /** Channels one connection may watch at a time. */
  channels: 24,
  /** Connections one account may hold; the oldest gives way. */
  perAccount: 8,
  /** How long a "may type here" answer is trusted. */
  typingTrustMs: 60_000,
  maxPayload: 2_048,
};

/**
 * Keeps one socket per open application and tells it when something it shows
 * has changed. It holds no state worth losing: a restart drops everybody, and
 * each client reconnects and reads everything again.
 *
 * One process holds every connection, which is what the deployment runs. A
 * second replica would need the events passed between them.
 */
export class LiveHub {
  private readonly connections = new Set<Connection>();
  private readonly byAccount = new Map<string, Set<Connection>>();
  private readonly byChannel = new Map<string, Set<Connection>>();
  private heartbeat?: ReturnType<typeof setInterval>;
  /** Told when an account's connections open or close. */
  onAccountChange?: (accountId: string) => void;

  constructor(
    private readonly access: LiveAccess,
    private readonly now: () => number = Date.now,
  ) {}

  /** Open connections that have signed in. */
  get size(): number {
    return [...this.connections].filter((connection) => connection.account).length;
  }

  async register(server: FastifyInstance): Promise<void> {
    await server.register(websocket, { options: { maxPayload: liveLimits.maxPayload } });
    server.get(livePath, { websocket: true }, (socket) => this.accept(socket));
    server.addHook('onListen', async () => {
      this.heartbeat = setInterval(() => void this.beat(), liveLimits.heartbeatMs);
      this.heartbeat.unref();
    });
    server.addHook('preClose', async () => this.close());
  }

  /** Sends an event to every connection of these accounts. */
  toAccounts(accountIds: Iterable<string>, event: LiveEvent): void {
    const payload = JSON.stringify(event);
    for (const accountId of new Set(accountIds))
      for (const connection of this.byAccount.get(accountId) ?? []) send(connection, payload);
  }

  /** Sends an event to every connection watching a channel, except one account's. */
  toChannel(channelId: string, event: LiveEvent, exceptAccountId?: string): void {
    const payload = JSON.stringify(event);
    for (const connection of this.byChannel.get(channelId) ?? [])
      if (connection.account?.id !== exceptAccountId) send(connection, payload);
  }

  /** Whether this account has a connection open. */
  connected(accountId: string): boolean {
    return this.byAccount.has(accountId);
  }

  /** Whether anybody of these accounts is connected, before asking who they are. */
  online(accountIds: Iterable<string>): boolean {
    for (const accountId of accountIds) if (this.byAccount.has(accountId)) return true;
    return false;
  }

  /** Ends a session's connections, when it signs out. */
  closeSession(sessionId: string): void {
    for (const connection of this.connections)
      if (connection.account?.sessionId === sessionId) connection.socket.close(liveUnauthorized, 'Signed out');
  }

  /**
   * Asks again whether these accounts may still read the channels they watch
   * and type where they did. Permissions change through the server's own
   * routes, so this runs after each of those rather than on a timer.
   */
  async recheck(accountIds: Iterable<string>): Promise<void> {
    const checks: Promise<void>[] = [];
    for (const accountId of new Set(accountIds))
      for (const connection of this.byAccount.get(accountId) ?? []) {
        connection.mayType.clear();
        for (const channelId of connection.channels)
          checks.push(
            this.access.canRead(accountId, channelId).catch(() => this.unwatch(connection, channelId)),
          );
      }
    await Promise.all(checks);
  }

  close(): void {
    if (this.heartbeat) clearInterval(this.heartbeat);
    for (const connection of this.connections) connection.socket.terminate();
    this.connections.clear();
    this.byAccount.clear();
    this.byChannel.clear();
  }

  private accept(socket: WebSocket): void {
    const connection: Connection = {
      socket,
      channels: new Set(),
      alive: true,
      checkedAt: this.now(),
      budget: { start: this.now(), used: 0 },
      typedAt: new Map(),
      mayType: new Map(),
      queue: Promise.resolve(),
    };
    this.connections.add(connection);
    const deadline = setTimeout(() => {
      if (!connection.account) socket.close(liveUnauthorized, 'Sign in first');
    }, liveLimits.authMs);
    deadline.unref();
    socket.on('pong', () => {
      connection.alive = true;
    });
    socket.on('message', (data, binary) => {
      if (binary || !this.withinBudget(connection)) {
        socket.close(liveTooChatty, 'Too many requests');
        return;
      }
      let parsed: z.infer<typeof request>;
      try {
        parsed = request.parse(JSON.parse(String(data)));
      } catch {
        return;
      }
      connection.queue = connection.queue.then(() => this.handle(connection, parsed).catch(() => undefined));
    });
    socket.on('close', () => {
      clearTimeout(deadline);
      this.drop(connection);
    });
    socket.on('error', () => socket.terminate());
  }

  private async handle(connection: Connection, message: z.infer<typeof request>): Promise<void> {
    if (message.type === 'auth') {
      if (connection.account) return;
      let account: LiveAccount;
      try {
        account = await this.access.authenticate(message.token);
      } catch {
        connection.socket.close(liveUnauthorized, 'Sign in again');
        return;
      }
      if (!this.connections.has(connection)) return;
      connection.account = { id: account.id, sessionId: account.sessionId, displayName: account.displayName };
      connection.checkedAt = this.now();
      const mine = this.byAccount.get(account.id) ?? new Set();
      this.byAccount.set(account.id, mine);
      mine.add(connection);
      // An account opening its ninth window closes its first.
      if (mine.size > liveLimits.perAccount)
        [...mine][0]?.socket.close(liveTooChatty, 'Too many connections');
      send(connection, JSON.stringify({ type: 'ready' } satisfies LiveEvent));
      this.onAccountChange?.(account.id);
      return;
    }
    const account = connection.account;
    if (!account) return;
    if (message.type === 'watch') {
      if (connection.channels.has(message.channelId) || connection.channels.size >= liveLimits.channels)
        return;
      await this.access.canRead(account.id, message.channelId);
      if (!this.connections.has(connection)) return;
      connection.channels.add(message.channelId);
      const watchers = this.byChannel.get(message.channelId) ?? new Set();
      this.byChannel.set(message.channelId, watchers);
      watchers.add(connection);
      return;
    }
    if (message.type === 'unwatch') {
      this.unwatch(connection, message.channelId);
      return;
    }
    await this.typing(connection, account, message);
  }

  private async typing(
    connection: Connection,
    account: LiveAccount,
    message: { channelId?: string; conversationId?: string },
  ): Promise<void> {
    const key = message.channelId
      ? `channel:${message.channelId}`
      : message.conversationId
        ? `direct:${message.conversationId}`
        : undefined;
    if (!key) return;
    // A client repeats this every few seconds; anything faster is noise.
    const last = connection.typedAt.get(key) ?? 0;
    if (this.now() - last < typingRepeatMs / 2) return;
    connection.typedAt.set(key, this.now());
    let allowed = connection.mayType.get(key);
    if (!allowed || allowed.until < this.now()) {
      try {
        if (message.channelId) {
          await this.access.canWrite(account.id, message.channelId);
          allowed = { until: this.now() + liveLimits.typingTrustMs };
        } else {
          const peerId = await this.access.peerOf(account.id, message.conversationId!);
          allowed = { until: this.now() + liveLimits.typingTrustMs, peerId };
        }
      } catch {
        connection.mayType.delete(key);
        return;
      }
      connection.mayType.set(key, allowed);
    }
    const event: LiveEvent = {
      type: 'typing',
      ...(message.channelId ? { channelId: message.channelId } : { conversationId: message.conversationId }),
      userId: account.id,
      name: account.displayName,
    };
    if (message.channelId) this.toChannel(message.channelId, event, account.id);
    else if (allowed.peerId) this.toAccounts([allowed.peerId], event);
  }

  private withinBudget(connection: Connection): boolean {
    const now = this.now();
    if (now - connection.budget.start > liveLimits.windowMs) connection.budget = { start: now, used: 0 };
    connection.budget.used += 1;
    return connection.budget.used <= liveLimits.requests;
  }

  private unwatch(connection: Connection, channelId: string): void {
    connection.channels.delete(channelId);
    const watchers = this.byChannel.get(channelId);
    watchers?.delete(connection);
    if (watchers && !watchers.size) this.byChannel.delete(channelId);
  }

  private drop(connection: Connection): void {
    if (!this.connections.delete(connection)) return;
    for (const channelId of connection.channels) this.unwatch(connection, channelId);
    const account = connection.account;
    if (!account) return;
    const mine = this.byAccount.get(account.id);
    mine?.delete(connection);
    if (mine && !mine.size) this.byAccount.delete(account.id);
    this.onAccountChange?.(account.id);
  }

  /** Pings everybody, drops the silent, and asks again about old sessions. */
  private async beat(): Promise<void> {
    const now = this.now();
    for (const connection of this.connections) {
      if (!connection.alive) {
        connection.socket.terminate();
        this.drop(connection);
        continue;
      }
      connection.alive = false;
      connection.socket.ping();
      const account = connection.account;
      if (account && now - connection.checkedAt > liveLimits.recheckMs) {
        connection.checkedAt = now;
        const alive = await this.access.sessionAlive(account.sessionId).catch(() => true);
        if (!alive) connection.socket.close(liveUnauthorized, 'Session ended');
      }
    }
  }
}

function send(connection: Connection, payload: string): void {
  if (connection.socket.readyState === connection.socket.OPEN) connection.socket.send(payload);
}
