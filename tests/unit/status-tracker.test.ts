// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { StatusTracker, statusTiming } from '../../server/status-tracker';
import type { LiveHub } from '../../server/live-hub';
import type { Database } from '../../server/database';
import type { LiveEvent } from '../../src/shared/live';

function setup() {
  let clock = 0;
  const sockets = new Set<string>();
  const sent: { to: string[]; event: LiveEvent }[] = [];
  const hub = {
    connected: (id: string) => sockets.has(id),
    toAccounts: (ids: Iterable<string>, event: LiveEvent) => sent.push({ to: [...ids], event }),
  } as unknown as LiveHub;
  // Everybody shares a server with the friend and the owner.
  const db = { query: async () => ({ rows: [{ id: 'owner' }, { id: 'friend' }] }) } as unknown as Database;
  const tracker = new StatusTracker(hub, db, () => clock);
  const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
  return {
    tracker,
    sockets,
    sent,
    flush,
    advance: async (ms: number) => {
      clock += ms;
      await tracker.sweep();
      await flush();
    },
  };
}

describe('status tracker', () => {
  it('announces a connection at once, to everybody but the person', async () => {
    const { tracker, sockets, sent, flush } = setup();
    sockets.add('friend');
    tracker.changed('friend');
    await flush();
    expect(tracker.isOnline('friend')).toBe(true);
    expect(sent).toEqual([{ to: ['owner'], event: { type: 'status', userId: 'friend', online: true } }]);
  });

  it('waits out a reconnect before calling anybody away', async () => {
    const { tracker, sockets, sent, flush, advance } = setup();
    sockets.add('friend');
    tracker.changed('friend');
    await flush();
    sockets.delete('friend');
    tracker.changed('friend');
    await advance(statusTiming.graceMs / 2);
    sockets.add('friend');
    tracker.changed('friend');
    await advance(statusTiming.graceMs * 2);
    expect(sent.map((item) => item.event)).toEqual([{ type: 'status', userId: 'friend', online: true }]);

    sockets.delete('friend');
    tracker.changed('friend');
    await advance(statusTiming.graceMs - 1);
    expect(sent).toHaveLength(1);
    await advance(statusTiming.sweepMs);
    expect(sent.at(-1)?.event).toEqual({ type: 'status', userId: 'friend', online: false });
    expect(tracker.isOnline('friend')).toBe(false);
  });

  it('counts a client that only makes requests as here while it keeps making them', async () => {
    const { tracker, sent, flush, advance } = setup();
    tracker.seen('friend');
    await flush();
    expect(sent.at(-1)?.event).toEqual({ type: 'status', userId: 'friend', online: true });
    await advance(statusTiming.requestWindowMs - 1_000);
    tracker.seen('friend');
    await advance(statusTiming.requestWindowMs - 1_000);
    expect(tracker.isOnline('friend')).toBe(true);
    expect(sent).toHaveLength(1);
    await advance(2_000);
    await advance(statusTiming.graceMs);
    expect(tracker.isOnline('friend')).toBe(false);
    expect(sent.at(-1)?.event).toEqual({ type: 'status', userId: 'friend', online: false });
  });
});
