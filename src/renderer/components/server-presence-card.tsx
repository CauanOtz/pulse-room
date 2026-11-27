import * as HoverCard from '@radix-ui/react-hover-card';
import { Volume2 } from 'lucide-react';
import { useEffect, useRef, useState, type CSSProperties, type ReactElement } from 'react';
import { accentFor, accountOf, callStartedAt, initialsOf, type ChannelOccupancy } from '../domain/roster';
import { useLiveSignals } from '../infrastructure/live-context';
import { Avatar } from './avatar';
import { CallTimer } from './call-timer';
import { useOverlayContainer } from './ui/overlay-portal';

/** Asks the service who sits in each voice channel of one server. */
export type PresenceReader = (serverId: string, signal: AbortSignal) => Promise<ChannelOccupancy[]>;

interface PeekServer {
  id: string;
  label: string;
  mark: string;
  iconId?: string | null;
}

type Reading = { state: 'loading' } | { state: 'ready'; rooms: ChannelOccupancy[] } | { state: 'failed' };

/**
 * The last answer per server, so a card opened again shows its people at once
 * and only refreshes them behind the scenes.
 */
const remembered = new Map<string, ChannelOccupancy[]>();

function usePresence(serverId: string, open: boolean, read: PresenceReader): Reading {
  const [reading, setReading] = useState<Reading>(() => {
    const known = remembered.get(serverId);
    return known ? { state: 'ready', rooms: known } : { state: 'loading' };
  });
  const [round, setRound] = useState(0);
  useLiveSignals((signal) => {
    if (open && (signal.type === 'sync' || (signal.type === 'presence' && signal.serverId === serverId)))
      setRound((value) => value + 1);
  });
  useEffect(() => {
    if (!open) return undefined;
    const controller = new AbortController();
    read(serverId, controller.signal)
      .then((rooms) => {
        if (controller.signal.aborted) return;
        remembered.set(serverId, rooms);
        setReading({ state: 'ready', rooms });
      })
      .catch(() => {
        if (!controller.signal.aborted && !remembered.has(serverId)) setReading({ state: 'failed' });
      });
    return () => controller.abort();
  }, [open, read, serverId, round]);
  return reading;
}

/** One person per account: a second window of theirs is still them. */
function peopleIn(room: ChannelOccupancy) {
  const seen = new Set<string>();
  return room.occupants.filter((occupant) => {
    const id = accountOf(occupant.identity);
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

/**
 * Who is talking in a server, shown beside its icon in the rail while the
 * pointer rests on it. It grows out of the icon with transitions.dev's
 * origin-aware "Menu dropdown" motion, and the faces along its top spring into
 * place on the overshoot curve of their "Avatar group hover".
 *
 * It is a glance, not a place: the pointer passes through it to the channels
 * underneath, and choosing the server puts it away.
 */
export function ServerPresenceCard({
  server,
  read,
  children,
}: {
  server: PeekServer;
  read: PresenceReader;
  children: ReactElement;
}) {
  const [open, setOpen] = useState(false);
  // A click focuses the button, and focus would open the card again at once;
  // having chosen the server, the card stays away until the pointer leaves.
  const chosen = useRef(false);
  // Radix types the trigger as a link; here it is always the server button.
  const trigger = useRef<HTMLAnchorElement>(null);
  const container = useOverlayContainer();
  return (
    <HoverCard.Root
      open={open}
      onOpenChange={(next) => {
        // A modal dialog hides everything behind it, the rail included; a card
        // opened then would sit above the dialog and take its clicks.
        const behindDialog = Boolean(trigger.current?.closest('[aria-hidden="true"]'));
        if (!next || (!chosen.current && !behindDialog)) setOpen(next);
      }}
      openDelay={260}
      closeDelay={110}
    >
      <HoverCard.Trigger
        asChild
        ref={trigger}
        onClick={() => {
          chosen.current = true;
          setOpen(false);
        }}
        onPointerLeave={() => {
          chosen.current = false;
        }}
        onFocus={(event) => {
          // Reached with the keyboard it opens; focus handed back by a closing
          // dialog or menu does not.
          if (!event.currentTarget.matches(':focus-visible')) event.preventDefault();
        }}
      >
        {children}
      </HoverCard.Trigger>
      <HoverCard.Portal container={container}>
        <HoverCard.Content
          side="right"
          align="start"
          sideOffset={20}
          alignOffset={-6}
          collisionPadding={12}
          className="server-peek"
        >
          <PeekBody server={server} read={read} open={open} />
        </HoverCard.Content>
      </HoverCard.Portal>
    </HoverCard.Root>
  );
}

function PeekBody({ server, read, open }: { server: PeekServer; read: PresenceReader; open: boolean }) {
  const reading = usePresence(server.id, open, read);
  const rooms =
    reading.state === 'ready'
      ? reading.rooms
          .map((room) => ({ ...room, people: peopleIn(room) }))
          .filter((room) => room.people.length > 0)
      : [];
  const everybody = rooms.flatMap((room) => room.people);
  const count = everybody.length;

  return (
    <>
      <header className="server-peek-head">
        <Avatar
          className="server-peek-icon"
          name={server.label}
          initials={server.mark}
          imageId={server.iconId}
        />
        <div className="server-peek-title">
          <strong>{server.label}</strong>
          <span className="server-peek-status" data-live={count > 0 || undefined}>
            <i aria-hidden="true" />
            {reading.state === 'loading'
              ? 'Looking…'
              : reading.state === 'failed'
                ? 'Voice unavailable'
                : count > 0
                  ? `${String(count).padStart(2, '0')} in voice`
                  : 'Nobody in voice'}
          </span>
        </div>
        {count > 0 && <FaceStack people={everybody} />}
      </header>

      {reading.state === 'loading' && (
        <div className="server-peek-skeleton" aria-hidden="true">
          <span />
          <span />
        </div>
      )}

      {reading.state === 'ready' && rooms.length === 0 && (
        <p className="server-peek-empty">Every voice channel is quiet right now.</p>
      )}

      {rooms.length > 0 && (
        <ul className="server-peek-rooms">
          {rooms.map((room, roomIndex) => {
            const since = callStartedAt(room);
            return (
              <li
                key={room.roomId}
                className="server-peek-room"
                style={{ '--i': roomIndex } as CSSProperties}
              >
                <div className="server-peek-room-head">
                  <Volume2 size={13} aria-hidden="true" />
                  <span className="server-peek-room-name">{room.name ?? 'Voice channel'}</span>
                  {since !== undefined && <CallTimer since={since} className="server-peek-timer" />}
                </div>
                <ul className="server-peek-people">
                  {room.people.map((person, index) => (
                    <li
                      key={person.identity}
                      className="server-peek-person"
                      style={{ '--i': roomIndex + index + 1 } as CSSProperties}
                    >
                      <Avatar
                        className="server-peek-avatar"
                        name={person.name}
                        initials={initialsOf(person.name)}
                        imageId={person.avatarId}
                        accent={accentFor(accountOf(person.identity))}
                      />
                      <span>{person.name}</span>
                    </li>
                  ))}
                </ul>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}

const stackSize = 4;

function FaceStack({ people }: { people: ChannelOccupancy['occupants'] }) {
  const shown = people.slice(0, stackSize);
  const rest = people.length - shown.length;
  return (
    <div className="server-peek-stack" aria-hidden="true">
      {shown.map((person, index) => (
        <span key={person.identity} className="server-peek-face" style={{ '--i': index } as CSSProperties}>
          <Avatar
            className="server-peek-face-picture"
            name={person.name}
            initials={initialsOf(person.name)}
            imageId={person.avatarId}
            accent={accentFor(accountOf(person.identity))}
          />
        </span>
      ))}
      {rest > 0 && (
        <span className="server-peek-face server-peek-more" style={{ '--i': shown.length } as CSSProperties}>
          +{rest}
        </span>
      )}
    </div>
  );
}
