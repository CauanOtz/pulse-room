/** How one person is played on this machine. */
export interface ListeningLevel {
  volume: number;
  muted: boolean;
}

const standard: ListeningLevel = { volume: 100, muted: false };

/**
 * The account behind a call identity. LiveKit identities are the account and
 * the session, and the session is new every time somebody joins, so a level
 * kept against the whole identity was forgotten the moment they rejoined.
 */
export const accountOf = (identity: string): string => identity.split(':')[0] ?? identity;

/**
 * The volume and the local mute set for each person, remembered on this
 * machine by account, the way a listener expects: turning a friend down once
 * is meant to last, through rejoining, switching servers and restarting.
 */
export class ListeningLevels {
  private static readonly storageKey = 'pulse-room:listening:v1';
  private levels: Record<string, ListeningLevel>;

  public constructor(private readonly storage: Storage | undefined = globalThis.localStorage) {
    this.levels = this.read();
  }

  public get(accountId: string): ListeningLevel {
    return this.levels[accountId] ?? standard;
  }

  public set(accountId: string, change: Partial<ListeningLevel>): void {
    const next = { ...this.get(accountId), ...change };
    next.volume = Math.min(200, Math.max(0, Math.round(next.volume)));
    // Somebody back at the standard level needs nothing remembered about them.
    if (next.volume === standard.volume && next.muted === standard.muted) delete this.levels[accountId];
    else this.levels[accountId] = next;
    try {
      this.storage?.setItem(ListeningLevels.storageKey, JSON.stringify(this.levels));
    } catch {
      // A full or blocked store still leaves the level right for this call.
    }
  }

  private read(): Record<string, ListeningLevel> {
    try {
      const saved = JSON.parse(this.storage?.getItem(ListeningLevels.storageKey) ?? '{}') as Record<
        string,
        unknown
      >;
      const levels: Record<string, ListeningLevel> = {};
      for (const [account, value] of Object.entries(saved)) {
        const level = value as Partial<ListeningLevel>;
        if (typeof level?.volume !== 'number' || typeof level.muted !== 'boolean') continue;
        levels[account] = { volume: level.volume, muted: level.muted };
      }
      return levels;
    } catch {
      return {};
    }
  }
}
