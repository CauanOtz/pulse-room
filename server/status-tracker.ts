import type { Database } from './database.js';
import type { LiveHub } from './live-hub.js';

export const statusTiming = {
  /**
   * A client without the live connection (the phone, an older desktop) counts
   * as here while it keeps reading; it reads every few seconds while open.
   */
  requestWindowMs: 30_000,
  /** Gone this long before anybody is told, so a reconnect or an update does not blink. */
  graceMs: 10_000,
  sweepMs: 5_000,
};

/**
 * Who is here right now: an open live connection, or a recent request.
 *
 * Held in memory and rebuilt within seconds of a restart, because it is a
 * fact about the moment and not worth a write per request. Only the people
 * who share a server or a conversation with somebody hear when they come or go.
 */
export class StatusTracker {
  private readonly lastRequest = new Map<string, number>();
  private readonly announced = new Set<string>();
  /** When an announced account was first seen gone. */
  private readonly goneSince = new Map<string, number>();
  private timer?: ReturnType<typeof setInterval>;

  constructor(
    private readonly hub: LiveHub,
    private readonly db: Database,
    private readonly now: () => number = Date.now,
  ) {}

  isOnline(accountId: string): boolean {
    if (this.hub.connected(accountId)) return true;
    const last = this.lastRequest.get(accountId);
    return last !== undefined && this.now() - last < statusTiming.requestWindowMs;
  }

  /** Somebody made a request; cheap enough to run on every one. */
  seen(accountId: string): void {
    this.lastRequest.set(accountId, this.now());
    if (!this.announced.has(accountId)) void this.settle(accountId);
    else this.goneSince.delete(accountId);
  }

  /** A live connection opened or closed for this account. */
  changed(accountId: string): void {
    void this.settle(accountId);
  }

  start(): void {
    this.timer = setInterval(() => void this.sweep(), statusTiming.sweepMs);
    this.timer.unref();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
  }

  /** Looks again at everybody who might have gone. */
  async sweep(): Promise<void> {
    for (const [accountId, last] of this.lastRequest)
      if (this.now() - last >= statusTiming.requestWindowMs && !this.announced.has(accountId))
        this.lastRequest.delete(accountId);
    await Promise.all([...this.announced].map((accountId) => this.settle(accountId)));
  }

  private async settle(accountId: string): Promise<void> {
    const online = this.isOnline(accountId);
    if (online) {
      this.goneSince.delete(accountId);
      if (this.announced.has(accountId)) return;
      this.announced.add(accountId);
      await this.announce(accountId, true);
      return;
    }
    if (!this.announced.has(accountId)) return;
    const since = this.goneSince.get(accountId);
    if (since === undefined) {
      this.goneSince.set(accountId, this.now());
      return;
    }
    if (this.now() - since < statusTiming.graceMs) return;
    this.goneSince.delete(accountId);
    this.announced.delete(accountId);
    this.lastRequest.delete(accountId);
    await this.announce(accountId, false);
  }

  private async announce(accountId: string, online: boolean): Promise<void> {
    const { rows } = await this.db
      .query<{ id: string }>(
        `SELECT m.account_id AS id FROM memberships m
          WHERE m.server_id IN (SELECT server_id FROM memberships WHERE account_id=$1)
        UNION
        SELECT CASE WHEN first_id=$1 THEN second_id ELSE first_id END
          FROM direct_conversations WHERE first_id=$1 OR second_id=$1`,
        [accountId],
      )
      .catch(() => ({ rows: [] as { id: string }[] }));
    this.hub.toAccounts(
      rows.map((row) => row.id).filter((id) => id !== accountId),
      { type: 'status', userId: accountId, online },
    );
  }
}
