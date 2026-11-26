import { useEffect, useState } from 'react';
import type { DesktopActivity } from '../../shared/desktop-api';
import type { CommunityClient } from './community-client';

/** The server forgets an activity after a minute and a half of silence; this repeats well inside it. */
const repeatMs = 30_000;
const nothing: DesktopActivity = { game: null, music: null };

/**
 * Tells the server what this computer is playing and listening to, as far as
 * the person allows: each kind can be kept private in the settings. A change
 * is sent at once, and the same activity is repeated while it goes on.
 */
export function useActivityReporter(
  api: CommunityClient | undefined,
  share: { games: boolean; music: boolean },
): void {
  const [detected, setDetected] = useState<DesktopActivity>(nothing);
  useEffect(() => {
    const activity = window.desktop?.activity;
    if (!activity) return undefined;
    void activity
      .current()
      .then(setDetected)
      .catch(() => undefined);
    return activity.onChange(setDetected);
  }, []);

  const game = share.games ? detected.game : null;
  const gameArt = game ? (detected.gameArt ?? null) : null;
  const music = share.music ? detected.music : null;
  // Whether games are shared at all travels too: it hides the history as well.
  const shared = JSON.stringify({ game, gameArt, music, sharesGames: share.games });
  useEffect(() => {
    if (!api || !window.desktop?.activity) return undefined;
    const report = JSON.parse(shared) as DesktopActivity & { sharesGames: boolean };
    const send = () => void api.request('/api/account/activity', 'PUT', report).catch(() => undefined);
    send();
    if (!report.game && !report.music) return undefined;
    const timer = setInterval(send, repeatMs);
    return () => clearInterval(timer);
  }, [api, shared]);
}
