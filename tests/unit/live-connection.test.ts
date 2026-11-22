import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LiveConnection, type LiveSignal } from '../../src/renderer/infrastructure/live-connection';
import { poll, typingLine } from '../../src/renderer/infrastructure/live-context';
import { liveUnauthorized, type LiveRequest } from '../../src/shared/live';

class FakeSocket {
  readyState = 0;
  sent: LiveRequest[] = [];
  onopen: ((event: unknown) => void) | null = null;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onclose: ((event: { code: number }) => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;
  constructor(public readonly url: string) {}
  send(data: string) {
    this.sent.push(JSON.parse(data) as LiveRequest);
  }
  close() {
    this.readyState = 3;
  }
  open() {
    this.readyState = 1;
    this.onopen?.({});
  }
  receive(event: unknown) {
    this.onmessage?.({ data: JSON.stringify(event) });
  }
  drop(code = 1006) {
    this.readyState = 3;
    this.onclose?.({ code });
  }
}

let sockets: FakeSocket[];
let clock: number;
const connection = () =>
  new LiveConnection(
    'https://pulse.example',
    () => 'token-1',
    (url) => {
      const socket = new FakeSocket(url);
      sockets.push(socket);
      return socket;
    },
    () => clock,
  );
const ready = (socket: FakeSocket) => {
  socket.open();
  socket.receive({ type: 'ready' });
};

beforeEach(() => {
  vi.useFakeTimers();
  sockets = [];
  clock = 0;
});
afterEach(() => vi.useRealTimers());

describe('live connection', () => {
  it('signs in with its first message on the socket address of the server', () => {
    const live = connection();
    live.start();
    expect(sockets[0].url).toBe('wss://pulse.example/api/live');
    sockets[0].open();
    expect(sockets[0].sent).toEqual([{ type: 'auth', token: 'token-1' }]);
    expect(live.state).toBe('connecting');
    sockets[0].receive({ type: 'ready' });
    expect(live.state).toBe('live');
  });

  it('says sync when it comes and goes, and passes events on', () => {
    const live = connection();
    const heard: LiveSignal[] = [];
    live.listen((signal) => heard.push(signal));
    live.start();
    ready(sockets[0]);
    sockets[0].receive({ type: 'server', serverId: 's1' });
    sockets[0].drop();
    expect(heard).toEqual([{ type: 'sync' }, { type: 'server', serverId: 's1' }, { type: 'sync' }]);
    expect(live.state).toBe('offline');
  });

  it('reconnects with growing waits and asks again for the channels on screen', () => {
    const live = connection();
    live.start();
    const stop = live.watch('channel-a');
    live.watch('channel-b');
    ready(sockets[0]);
    expect(sockets[0].sent.slice(1)).toEqual([
      { type: 'watch', channelId: 'channel-a' },
      { type: 'watch', channelId: 'channel-b' },
    ]);
    stop();
    expect(sockets[0].sent.at(-1)).toEqual({ type: 'unwatch', channelId: 'channel-a' });

    sockets[0].drop();
    vi.advanceTimersByTime(1_300);
    expect(sockets).toHaveLength(2);
    sockets[1].drop();
    vi.advanceTimersByTime(1_400);
    expect(sockets).toHaveLength(2);
    vi.advanceTimersByTime(1_300);
    expect(sockets).toHaveLength(3);
    ready(sockets[2]);
    expect(sockets[2].sent).toEqual([
      { type: 'auth', token: 'token-1' },
      { type: 'watch', channelId: 'channel-b' },
    ]);
  });

  it('watches a channel once however many screens show it', () => {
    const live = connection();
    live.start();
    ready(sockets[0]);
    const first = live.watch('channel-a');
    const second = live.watch('channel-a');
    first();
    first();
    expect(sockets[0].sent.filter((request) => request.type !== 'auth')).toEqual([
      { type: 'watch', channelId: 'channel-a' },
    ]);
    second();
    expect(sockets[0].sent.at(-1)).toEqual({ type: 'unwatch', channelId: 'channel-a' });
  });

  it('gives up on a session the server refuses', () => {
    const live = connection();
    live.start();
    sockets[0].open();
    sockets[0].drop(liveUnauthorized);
    vi.advanceTimersByTime(60_000);
    expect(sockets).toHaveLength(1);
  });

  it('says typing once every few seconds, and at once again after a message', () => {
    const live = connection();
    live.start();
    ready(sockets[0]);
    const typing = () => sockets[0].sent.filter((request) => request.type === 'typing').length;
    live.typing({ channelId: 'c' });
    live.typing({ channelId: 'c' });
    clock = 2_000;
    live.typing({ channelId: 'c' });
    expect(typing()).toBe(1);
    clock = 3_100;
    live.typing({ channelId: 'c' });
    expect(typing()).toBe(2);
    live.stoppedTyping({ channelId: 'c' });
    live.typing({ channelId: 'c' });
    expect(typing()).toBe(3);
    live.typing({ conversationId: 'd' });
    expect(sockets[0].sent.at(-1)).toEqual({ type: 'typing', conversationId: 'd' });
  });

  it('stops for good when told to', () => {
    const live = connection();
    live.start();
    ready(sockets[0]);
    live.stop();
    expect(live.state).toBe('offline');
    vi.advanceTimersByTime(60_000);
    expect(sockets).toHaveLength(1);
  });
});

describe('poll', () => {
  it('reads on its timer, follows the wait it is given, and runs one read at a time', async () => {
    let wait = 3_000;
    let release: () => void = () => undefined;
    const read = vi.fn(() => new Promise<void>((resolve) => (release = resolve)));
    const poller = poll(read, () => wait);
    expect(read).toHaveBeenCalledTimes(1);
    poller.kick();
    poller.kick();
    expect(read).toHaveBeenCalledTimes(1);
    release();
    await vi.advanceTimersByTimeAsync(0);
    // The kicks during the read become exactly one more read.
    expect(read).toHaveBeenCalledTimes(2);
    wait = 30_000;
    release();
    await vi.advanceTimersByTimeAsync(29_000);
    expect(read).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(read).toHaveBeenCalledTimes(3);
    poller.stop();
    release();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(read).toHaveBeenCalledTimes(3);
  });

  it('keeps going after a failed read', async () => {
    const read = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue(undefined);
    const poller = poll(read, () => 1_000);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(read).toHaveBeenCalledTimes(2);
    poller.stop();
  });
});

describe('typing line', () => {
  it('names one or two people and counts the rest', () => {
    expect(typingLine([])).toBe('');
    expect(typingLine([{ userId: '1', name: 'Ana' }])).toBe('Ana is typing');
    expect(
      typingLine([
        { userId: '1', name: 'Ana' },
        { userId: '2', name: 'Bo' },
      ]),
    ).toBe('Ana and Bo are typing');
    expect(
      typingLine([
        { userId: '1', name: 'Ana' },
        { userId: '2', name: 'Bo' },
        { userId: '3', name: 'Cy' },
      ]),
    ).toBe('Several people are typing');
  });
});
