import { useEffect, useState, type ReactNode } from 'react';
import { Gamepad2, Music2 } from 'lucide-react';
import type { MemberActivity, RecentGame } from '../../shared/community';
import type { CommunityClient } from '../infrastructure/community-client';
import { CallTimer } from './call-timer';
import { ProfileBlock } from './profile-shell';

const minutes = (total: number) =>
  total < 1
    ? 'Under a minute'
    : total < 60
      ? `${total} min`
      : `${Math.floor(total / 60)} h ${total % 60 ? `${total % 60} min` : ''}`.trim();

const ago = (iso: string) => {
  const elapsed = Date.now() - new Date(iso).getTime();
  const hours = Math.floor(elapsed / 3_600_000);
  if (hours < 1) return 'Just now';
  if (hours < 24) return `${hours} h ago`;
  const days = Math.floor(hours / 24);
  return days === 1 ? 'Yesterday' : `${days} days ago`;
};

/** Three bars that move while a song plays, the way a speaker cone would. */
function Equalizer() {
  return (
    <span className="activity-equalizer" aria-hidden="true">
      <i />
      <i />
      <i />
    </span>
  );
}

/**
 * A game's or a song's picture. A store cover fills its tile; a program's own
 * icon sits small in the middle of it, the way it would on a desktop. When
 * there is no picture, or it does not load, the tile keeps its symbol.
 */
function Cover({ src, children }: { src?: string | null; children: ReactNode }) {
  const [broken, setBroken] = useState(false);
  useEffect(() => setBroken(false), [src]);
  if (!src || broken) return <>{children}</>;
  const icon = src.startsWith('data:image/png');
  return (
    <img
      className={icon ? 'activity-icon' : 'activity-cover'}
      src={src}
      alt=""
      draggable={false}
      onError={() => setBroken(true)}
    />
  );
}

/** A song position as a player shows it: 3:07, or 1:02:45 past an hour. */
export const songClock = (seconds: number) => {
  const whole = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(whole / 3600);
  const rest = `${Math.floor((whole % 3600) / 60)}:${String(whole % 60).padStart(2, '0')}`;
  return hours ? `${hours}:${rest.padStart(5, '0')}` : rest;
};

type Music = NonNullable<MemberActivity['music']>;

/** How far into the song they are, counted here each second from when it began. */
function useSongPosition(music?: Music): { elapsed: number; length: number } | null {
  const started = music?.startedAt ? Date.parse(music.startedAt) : NaN;
  const length = music?.length ?? 0;
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!length || Number.isNaN(started)) return undefined;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [started, length]);
  if (!length || Number.isNaN(started)) return null;
  return { elapsed: Math.min(length, Math.max(0, (now - started) / 1000)), length };
}

/** A thin line that fills as the song plays, with where it is and how long it lasts. */
function SongProgress({ music }: { music: Music }) {
  const position = useSongPosition(music);
  if (!position) return null;
  return (
    <span
      className="activity-song"
      aria-label={`${songClock(position.elapsed)} of ${songClock(position.length)}`}
    >
      <span className="activity-song-time">{songClock(position.elapsed)}</span>
      <span className="activity-song-track" aria-hidden="true">
        <span style={{ transform: `scaleX(${position.elapsed / position.length})` }} />
      </span>
      <span className="activity-song-time">{songClock(position.length)}</span>
    </span>
  );
}

/** The same, in a few characters, for the small card. */
function SongClock({ music }: { music: Music }) {
  const position = useSongPosition(music);
  if (!position) return null;
  return (
    <span className="activity-time">
      {songClock(position.elapsed)} / {songClock(position.length)}
    </span>
  );
}

/** Store covers are tall; the tile follows them, and stays square for an icon. */
const tall = (src?: string | null) => Boolean(src && !src.startsWith('data:image/png'));

/** What somebody is doing now, on one or two lines: for the small profile card. */
export function ActivityLines({ activity }: { activity?: MemberActivity }) {
  if (!activity?.game && !activity?.music) return null;
  return (
    <ul className="activity-lines" aria-label="Activity">
      {activity.game && (
        <li>
          <span className={`activity-mark is-game${activity.game.art ? ' has-art' : ''}`} aria-hidden="true">
            <Cover src={activity.game.art}>
              <Gamepad2 size={13} />
            </Cover>
          </span>
          <span className="min-w-0 truncate">
            <span className="activity-verb">Playing </span>
            <strong>{activity.game.name}</strong>
          </span>
          <CallTimer since={new Date(activity.game.since).getTime()} className="activity-time" />
        </li>
      )}
      {activity.music && (
        <li>
          <span
            className={`activity-mark is-music${activity.music.art ? ' has-art' : ''}`}
            aria-hidden="true"
          >
            <Cover src={activity.music.art}>
              <Equalizer />
            </Cover>
          </span>
          <span className="min-w-0 truncate">
            <strong>{activity.music.title}</strong>
            <span className="activity-verb"> · {activity.music.artist}</span>
          </span>
          {activity.music.length && activity.music.startedAt ? (
            <SongClock music={activity.music} />
          ) : (
            activity.music.art && (
              <span className="activity-time is-playing">
                <Equalizer />
              </span>
            )
          )}
        </li>
      )}
    </ul>
  );
}

/**
 * The whole story for the profile: what they are playing and listening to
 * right now, and the games they spent time on in the last two weeks.
 */
export function ActivityBlock({
  api,
  accountId,
  activity,
}: {
  api: CommunityClient;
  accountId: string;
  activity?: MemberActivity;
}) {
  const [games, setGames] = useState<RecentGame[]>([]);
  const playing = activity?.game?.name;
  useEffect(() => {
    let stopped = false;
    api
      .request<{ games: RecentGame[] }>(`/api/accounts/${accountId}/games`)
      .then((result) => !stopped && setGames(result.games))
      .catch(() => !stopped && setGames([]));
    return () => {
      stopped = true;
    };
  }, [api, accountId, playing]);

  const lately = games.filter((game) => !game.playing && game.name !== playing).slice(0, 3);
  if (!activity?.game && !activity?.music && !lately.length) return null;

  return (
    <ProfileBlock title="Activity" className="profile-activity">
      {activity?.game && (
        <div className="activity-now is-game">
          <span
            className={`activity-now-art${activity.game.art ? ' has-art' : ''}${tall(activity.game.art) ? ' is-tall' : ''}`}
            aria-hidden="true"
          >
            <Cover src={activity.game.art}>
              <Gamepad2 size={20} />
            </Cover>
          </span>
          <span className="activity-now-text">
            <small>Playing now</small>
            <strong title={activity.game.name}>{activity.game.name}</strong>
            <span>
              for <CallTimer since={new Date(activity.game.since).getTime()} className="activity-time" />
            </span>
          </span>
        </div>
      )}
      {activity?.music && (
        <div className="activity-now is-music">
          <span className={`activity-now-art${activity.music.art ? ' has-art' : ''}`} aria-hidden="true">
            <Cover src={activity.music.art}>
              <Music2 size={18} />
            </Cover>
            <Equalizer />
          </span>
          <span className="activity-now-text">
            <small>{activity.music.spotify ? 'Listening on Spotify' : 'Listening to music'}</small>
            <strong title={activity.music.title}>{activity.music.title}</strong>
            <span title={activity.music.artist}>{activity.music.artist}</span>
            <SongProgress music={activity.music} />
          </span>
        </div>
      )}
      {lately.length > 0 && (
        <div className="activity-lately">
          <h4>Played lately</h4>
          <ul>
            {lately.map((game) => (
              <li key={game.name}>
                <span
                  className={`activity-lately-mark${game.art ? ' has-art' : ''}${tall(game.art) ? ' is-tall' : ''}`}
                  aria-hidden="true"
                >
                  <Cover src={game.art}>{game.name.slice(0, 1).toUpperCase()}</Cover>
                </span>
                <span className="activity-lately-name" title={game.name}>
                  {game.name}
                </span>
                <span className="activity-lately-meta">
                  {minutes(game.minutes)} · {ago(game.lastPlayedAt)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </ProfileBlock>
  );
}
