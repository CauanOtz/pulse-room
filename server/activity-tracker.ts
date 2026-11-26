import type { Database } from './database.js';
import type { LiveHub } from './live-hub.js';
import type { MemberActivity, RecentGame } from '../src/shared/community.js';

export const activityTiming = {
  /** A desktop repeats what it is doing about every half minute; silence this long means it stopped. */
  staleMs: 90_000,
  sweepMs: 15_000,
  /** How far back "played recently" looks. */
  recentDays: 14,
};

export interface ReportedActivity {
  game: string | null;
  /** A small picture of the game, as a data URL. */
  gameArt?: string | null;
  /** False when they keep their games to themselves, the history included. */
  sharesGames?: boolean;
  music: {
    title: string;
    artist: string;
    art?: string | null;
    spotify?: boolean;
    length?: number;
    startedAt?: string;
  } | null;
}

interface Current {
  activity: MemberActivity;
  at: number;
  /** The open game session, while a game is being played. */
  sessionId?: string;
}

/**
 * A song's place in time, kept only when it makes sense: a start in the last
 * day and not in the future, for a song whose length is known.
 */
function timeline(music: { length?: number; startedAt?: string }, at: number) {
  if (!music.length || !music.startedAt) return undefined;
  const started = Date.parse(music.startedAt);
  if (!(started <= at + 5_000 && started > at - 86_400_000)) return undefined;
  return { length: music.length, startedAt: new Date(started).toISOString() };
}

/**
 * Everyone who sees a person's presence: the members of every server they are
 * in, and the people they have a direct conversation with.
 */
export async function peopleWhoSee(db: Database, accountId: string): Promise<string[]> {
  const { rows } = await db
    .query<{ id: string }>(
      `SELECT m.account_id AS id FROM memberships m
        WHERE m.server_id IN (SELECT server_id FROM memberships WHERE account_id=$1)
      UNION
      SELECT CASE WHEN first_id=$1 THEN second_id ELSE first_id END
        FROM direct_conversations WHERE first_id=$1 OR second_id=$1`,
      [accountId],
    )
    .catch(() => ({ rows: [] as { id: string }[] }));
  return rows.map((row) => row.id).filter((id) => id !== accountId);
}

/**
 * What people are playing and listening to, as their desktops report it.
 *
 * The moment is held in memory and told to the people who share a server or a
 * conversation with them; the games are also written down as sessions, so a
 * profile can say what somebody has been playing lately.
 */
export class ActivityTracker {
  private readonly current = new Map<string, Current>();
  private timer?: ReturnType<typeof setInterval>;

  constructor(
    private readonly hub: LiveHub,
    private readonly db: Database,
    private readonly now: () => number = Date.now,
  ) {}

  get(accountId: string): MemberActivity | undefined {
    const entry = this.current.get(accountId);
    return entry && this.now() - entry.at < activityTiming.staleMs ? entry.activity : undefined;
  }

  async start(): Promise<void> {
    // Sessions left open by a server that stopped end where they were last seen.
    await this.db
      .query('UPDATE game_sessions SET ended_at=last_seen_at WHERE ended_at IS NULL')
      .catch(() => undefined);
    this.timer = setInterval(() => void this.sweep(), activityTiming.sweepMs);
    this.timer.unref();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
  }

  async report(accountId: string, reported: ReportedActivity): Promise<void> {
    const at = this.now();
    if (reported.sharesGames !== undefined)
      await this.db
        .query('UPDATE accounts SET shares_games=$2 WHERE id=$1 AND shares_games<>$2', [
          accountId,
          reported.sharesGames,
        ])
        .catch(() => undefined);
    const before = this.current.get(accountId);
    const previous = before?.activity;
    const game = reported.game
      ? {
          name: reported.game,
          since: previous?.game?.name === reported.game ? previous.game.since : new Date(at).toISOString(),
          ...(reported.gameArt ? { art: reported.gameArt } : {}),
        }
      : undefined;
    if (game?.art && game.art !== previous?.game?.art) await this.keepArt(accountId, game.name, game.art);
    const music = reported.music
      ? {
          title: reported.music.title,
          artist: reported.music.artist,
          ...(reported.music.art ? { art: reported.music.art } : {}),
          ...(reported.music.spotify ? { spotify: true } : {}),
          ...(timeline(reported.music, at) ?? {}),
          since:
            previous?.music?.title === reported.music.title && previous.music.artist === reported.music.artist
              ? previous.music.since
              : new Date(at).toISOString(),
        }
      : undefined;

    let sessionId = before?.sessionId;
    if (previous?.game?.name !== game?.name) {
      if (sessionId) await this.closeSession(sessionId, at);
      sessionId = game ? await this.openSession(accountId, game.name, at) : undefined;
    } else if (sessionId) {
      await this.db
        .query('UPDATE game_sessions SET last_seen_at=$2 WHERE id=$1', [sessionId, new Date(at)])
        .catch(() => undefined);
    }

    const activity: MemberActivity = { ...(game ? { game } : {}), ...(music ? { music } : {}) };
    const empty = !game && !music;
    if (empty) this.current.delete(accountId);
    else this.current.set(accountId, { activity, at, sessionId });

    const changed = JSON.stringify(previous ?? null) !== JSON.stringify(empty ? null : activity);
    if (changed) await this.announce(accountId, empty ? null : activity);
  }

  /** Forgets whoever stopped reporting, as if they had said they stopped. */
  async sweep(): Promise<void> {
    const at = this.now();
    for (const [accountId, entry] of [...this.current]) {
      if (at - entry.at < activityTiming.staleMs) continue;
      this.current.delete(accountId);
      if (entry.sessionId) await this.closeSession(entry.sessionId, entry.at);
      await this.announce(accountId, null);
    }
  }

  /** Whether one account may see another's: they share a server or a conversation. */
  async canSee(viewerId: string, accountId: string): Promise<boolean> {
    if (viewerId === accountId) return true;
    return (await peopleWhoSee(this.db, accountId)).includes(viewerId);
  }

  /** The games somebody played lately, the most recent first, with the time spent on each. */
  async recent(accountId: string): Promise<RecentGame[]> {
    const playing = this.get(accountId)?.game?.name;
    const { rows } = await this.db.query<{
      name: string;
      seconds: number | string;
      last: string | Date;
      art: string | null;
    }>(
      `SELECT s.name,
        SUM(EXTRACT(EPOCH FROM (COALESCE(s.ended_at, s.last_seen_at) - s.started_at))) AS seconds,
        MAX(COALESCE(s.ended_at, s.last_seen_at)) AS last,
        MAX(a.art) AS art
      FROM game_sessions s
      LEFT JOIN game_art a ON a.account_id=s.account_id AND a.name=s.name
      JOIN accounts owner ON owner.id=s.account_id AND owner.shares_games
      WHERE s.account_id=$1 AND s.started_at > $2
      GROUP BY s.name ORDER BY last DESC LIMIT 5`,
      [accountId, new Date(this.now() - activityTiming.recentDays * 86_400_000)],
    );
    return rows.map((row) => ({
      name: row.name,
      minutes: Math.max(0, Math.round(Number(row.seconds) / 60)),
      lastPlayedAt: new Date(row.last).toISOString(),
      playing: row.name === playing,
      ...(row.art ? { art: row.art } : {}),
    }));
  }

  /** The last picture seen for a game, for the list of what was played lately. */
  private async keepArt(accountId: string, name: string, art: string): Promise<void> {
    await this.db
      .query(
        `INSERT INTO game_art(account_id,name,art) VALUES($1,$2,$3)
        ON CONFLICT (account_id,name) DO UPDATE SET art=EXCLUDED.art`,
        [accountId, name, art],
      )
      .catch(() => undefined);
  }

  private async openSession(accountId: string, name: string, at: number): Promise<string | undefined> {
    const id = crypto.randomUUID();
    const when = new Date(at);
    try {
      await this.db.query(
        'INSERT INTO game_sessions(id,account_id,name,started_at,last_seen_at) VALUES($1,$2,$3,$4,$4)',
        [id, accountId, name, when],
      );
      return id;
    } catch {
      return undefined;
    }
  }

  private async closeSession(sessionId: string, at: number): Promise<void> {
    await this.db
      .query('UPDATE game_sessions SET ended_at=$2, last_seen_at=$2 WHERE id=$1 AND ended_at IS NULL', [
        sessionId,
        new Date(at),
      ])
      .catch(() => undefined);
  }

  private async announce(accountId: string, activity: MemberActivity | null): Promise<void> {
    // Their own other windows hear it too, for their own profile.
    this.hub.toAccounts([accountId, ...(await peopleWhoSee(this.db, accountId))], {
      type: 'activity',
      userId: accountId,
      activity,
    });
  }
}
