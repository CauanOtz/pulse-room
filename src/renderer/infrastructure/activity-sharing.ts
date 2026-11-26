import { useCallback, useSyncExternalStore } from 'react';

/** What a person lets the people around them see of what they are doing. */
export interface ActivitySharing {
  /** The game that is open, and the games played lately. */
  games: boolean;
  /** The song that is playing, with its cover and where it is. */
  music: boolean;
}

const everything: ActivitySharing = { games: true, music: true };
const keyOf = (accountId: string) => `pulse-room:activity-sharing:${accountId}`;
const listeners = new Set<() => void>();
const cache = new Map<string, { raw: string | null; value: ActivitySharing }>();

function read(accountId: string | undefined): ActivitySharing {
  if (!accountId) return everything;
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(keyOf(accountId));
  } catch {
    raw = null;
  }
  // The same object while nothing changed, as a store snapshot must be.
  const known = cache.get(accountId);
  if (known && known.raw === raw) return known.value;
  let value = everything;
  try {
    const stored = raw ? (JSON.parse(raw) as Partial<ActivitySharing>) : {};
    value = { games: stored.games !== false, music: stored.music !== false };
  } catch {
    value = everything;
  }
  cache.set(accountId, { raw, value });
  return value;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  // Another window of the app changing it is heard too.
  window.addEventListener('storage', listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', listener);
  };
}

/**
 * Whether this account shares its games and its music, kept on this computer
 * per account. Read by whatever reports the activity and changed from the
 * account settings; both see a change at once. Everything is shared until the
 * person turns it off.
 */
export function useActivitySharing(
  accountId: string | undefined,
): [ActivitySharing, (change: Partial<ActivitySharing>) => void] {
  const sharing = useSyncExternalStore(subscribe, () => read(accountId));
  const change = useCallback(
    (next: Partial<ActivitySharing>) => {
      if (!accountId) return;
      try {
        window.localStorage.setItem(keyOf(accountId), JSON.stringify({ ...read(accountId), ...next }));
      } catch {
        return;
      }
      for (const listener of listeners) listener();
    },
    [accountId],
  );
  return [sharing, change];
}
