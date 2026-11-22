import {
  liveUnauthorized,
  livePath,
  typingRepeatMs,
  type LiveEvent,
  type LiveRequest,
} from '../../shared/live';

/**
 * What a listener hears: the server's events, plus `sync` whenever the
 * connection comes or goes. Events may have been missed across either, so
 * `sync` means "read everything you show again".
 */
export type LiveSignal = LiveEvent | { type: 'sync' };
export type LiveState = 'offline' | 'connecting' | 'live';

interface SocketLike {
  readonly readyState: number;
  send(data: string): void;
  close(code?: number, reason?: string): void;
  onopen: ((event: unknown) => void) | null;
  onmessage: ((event: { data: unknown }) => void) | null;
  onclose: ((event: { code: number }) => void) | null;
  onerror: ((event: unknown) => void) | null;
}

const open = 1;
const backoff = [1_000, 2_000, 4_000, 8_000, 15_000, 30_000];

/**
 * One socket to the server for the whole application.
 *
 * It reconnects on its own, signs in with its first message, and asks again
 * for the channels on screen after every reconnect. When it cannot connect
 * (an older server, a proxy that drops sockets) nothing breaks: the screens
 * keep reading on their own timers, only faster.
 */
export class LiveConnection {
  state: LiveState = 'offline';
  private socket?: SocketLike;
  private readonly listeners = new Set<(signal: LiveSignal) => void>();
  private readonly watched = new Map<string, number>();
  private readonly typedAt = new Map<string, number>();
  private attempt = 0;
  private retry?: ReturnType<typeof setTimeout>;
  private running = false;

  constructor(
    private readonly url: string,
    private readonly token: () => string,
    private readonly makeSocket: (url: string) => SocketLike = (address) =>
      new WebSocket(address) as unknown as SocketLike,
    private readonly now: () => number = Date.now,
  ) {}

  get live(): boolean {
    return this.state === 'live';
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.connect();
  }

  stop(): void {
    this.running = false;
    clearTimeout(this.retry);
    const socket = this.socket;
    this.socket = undefined;
    if (socket) {
      socket.onclose = null;
      socket.close();
    }
    this.become('offline');
  }

  /** Hears every event, and `sync` when the connection comes or goes. */
  listen(listener: (signal: LiveSignal) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Asks for a channel's events while it is on screen; call the result to stop. */
  watch(channelId: string): () => void {
    const count = this.watched.get(channelId) ?? 0;
    this.watched.set(channelId, count + 1);
    if (!count) this.send({ type: 'watch', channelId });
    let done = false;
    return () => {
      if (done) return;
      done = true;
      const left = (this.watched.get(channelId) ?? 1) - 1;
      if (left > 0) {
        this.watched.set(channelId, left);
        return;
      }
      this.watched.delete(channelId);
      this.send({ type: 'unwatch', channelId });
    };
  }

  /** Says you are typing here; cheap to call on every key, it sends every few seconds. */
  typing(place: { channelId: string } | { conversationId: string }): void {
    const key = 'channelId' in place ? `c:${place.channelId}` : `d:${place.conversationId}`;
    const last = this.typedAt.get(key) ?? -Infinity;
    if (this.now() - last < typingRepeatMs) return;
    if (!this.send({ type: 'typing', ...place } as LiveRequest)) return;
    this.typedAt.set(key, this.now());
  }

  /** Lets the next keystroke say so again at once, after a message is sent. */
  stoppedTyping(place: { channelId: string } | { conversationId: string }): void {
    this.typedAt.delete('channelId' in place ? `c:${place.channelId}` : `d:${place.conversationId}`);
  }

  private connect(): void {
    if (!this.running) return;
    const token = this.token();
    if (!token) return;
    this.become('connecting');
    let socket: SocketLike;
    try {
      socket = this.makeSocket(`${this.url.replace(/^http/, 'ws')}${livePath}`);
    } catch {
      this.later();
      return;
    }
    this.socket = socket;
    socket.onopen = () => socket.send(JSON.stringify({ type: 'auth', token } satisfies LiveRequest));
    socket.onmessage = ({ data }) => {
      let event: LiveEvent;
      try {
        event = JSON.parse(String(data)) as LiveEvent;
      } catch {
        return;
      }
      if (event.type === 'ready') {
        this.attempt = 0;
        // Watching again before anybody reads, so nothing falls between the two.
        this.state = 'live';
        for (const channelId of this.watched.keys()) this.send({ type: 'watch', channelId });
        this.emit({ type: 'sync' });
        return;
      }
      this.emit(event);
    };
    socket.onerror = () => undefined;
    socket.onclose = ({ code }) => {
      if (this.socket !== socket) return;
      this.socket = undefined;
      this.become('offline');
      // A session the server refuses stays refused; the next sign-in starts again.
      if (code === liveUnauthorized) {
        this.running = false;
        return;
      }
      this.later();
    };
  }

  private later(): void {
    if (!this.running) return;
    const wait = backoff[Math.min(this.attempt, backoff.length - 1)];
    this.attempt += 1;
    // Spread out so a server restart is not met by everybody at once.
    this.retry = setTimeout(() => this.connect(), wait * (0.75 + Math.random() * 0.5));
  }

  private send(request: LiveRequest): boolean {
    const socket = this.socket;
    if (!socket || socket.readyState !== open || this.state !== 'live') return false;
    socket.send(JSON.stringify(request));
    return true;
  }

  private become(state: LiveState): void {
    if (this.state === state) return;
    const wasLive = this.state === 'live';
    this.state = state;
    if (state === 'live' || wasLive) this.emit({ type: 'sync' });
  }

  private emit(signal: LiveSignal): void {
    for (const listener of [...this.listeners]) listener(signal);
  }
}
