import { MicOff, MonitorUp, PhoneOff, VolumeX } from 'lucide-react';
import type { ConnectionState, SignalQuality } from '../domain/conference';
import type { RosterEntry } from '../domain/roster';
import { Avatar } from './avatar';
import { LiveBadge } from './live-badge';
import { Pulse } from './pulse';
import { SignalBars } from './signal-bars';
import { Tooltip } from './ui/tooltip';
import { cn } from './ui/utils';

interface VoicePanelProps {
  connectionState: ConnectionState;
  /** Where you are, in the order you would say it: room, then server. */
  channelName: string;
  serverName?: string;
  /** Your own line, which is the one you can do something about. */
  signal?: SignalQuality;
  /** Everybody in the call, drawn here rather than in the channel list. */
  people: RosterEntry[];
  watching?: string[];
  screenSharing: boolean;
  busy: boolean;
  /** True when it sits in the list, in the place of its own channel row. */
  inList?: boolean;
  onLeave(): void;
  onReturn?(): void;
  onShare(): void;
  onOpenParticipant?(entry: RosterEntry, position: { x: number; y: number }): void;
}

/**
 * The call, as an object rather than as a status line.
 *
 * This is the room the application is named for, and until now it was a
 * caption in the corner of a list of channels. The channels you are not in are
 * a list; the one you are in is a thing, sitting on its own surface, holding
 * the people who are in it and showing which of them is making sound.
 *
 * The meter beside each name is the live amplitude of that person's voice,
 * taken from the measurement the audio graph already makes. It is the one
 * thing in this application that no other application could draw, because it
 * is the product: five people, a black room, and who is talking.
 */
export function VoicePanel(props: VoicePanelProps) {
  const reconnecting = props.connectionState === 'reconnecting';
  const troubled = props.signal === 'poor' || props.signal === 'lost';
  const unwell = reconnecting || troubled;
  const heading = reconnecting
    ? 'Reconnecting'
    : props.signal === 'lost'
      ? 'Connection lost'
      : props.signal === 'poor'
        ? 'Poor connection'
        : 'Voice connected';

  return (
    <section
      className={cn(
        'voice-panel flex flex-col overflow-hidden rounded-lg border border-border bg-card shadow-[var(--gloss)]',
        // In the list it grows out of its own row and keeps its place there.
        // Adrift, it holds the foot of the column instead.
        props.inList ? 'mx-1 mb-2 mt-0.5' : 'mx-2 mb-2 mt-auto',
      )}
      aria-label="Voice status"
    >
      <button
        className={cn(
          'voice-heading group flex flex-col items-start gap-0.5 px-3 text-left',
          props.inList ? 'py-2' : 'py-2.5',
          props.onReturn ? 'cursor-pointer hover:bg-accent/40' : 'cursor-default',
          'transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
        )}
        type="button"
        aria-label={props.onReturn ? 'Return to call' : 'Current call'}
        disabled={!props.onReturn}
        onClick={props.onReturn}
      >
        <span className="flex w-full items-center gap-1.5">
          <SignalBars
            always
            signal={props.signal ?? (reconnecting ? 'poor' : 'excellent')}
            className={cn('h-2.5', unwell ? 'text-destructive' : 'text-success')}
          />
          <span
            className={cn(
              'font-mono text-[9px] font-medium uppercase tracking-[0.16em]',
              unwell ? 'text-destructive' : 'text-success',
            )}
          >
            {heading}
          </span>
        </span>
        {/* Sitting under its own row, the room has already been named eight
            pixels above; saying it again is just the same word twice. Adrift
            in another server, nothing else names it, so it says so itself and
            says it larger than any channel in the list. */}
        {!props.inList && (
          <span className="w-full truncate text-[17px] font-semibold leading-tight tracking-[-0.02em] text-foreground group-hover:underline [text-underline-offset:3px]">
            {props.channelName}
          </span>
        )}
        <span className="w-full truncate font-mono text-[10.5px] text-muted-foreground">
          {props.people.length} {props.people.length === 1 ? 'person' : 'people'}
          {props.serverName && !props.inList && (
            <span className="text-muted-foreground/55"> · {props.serverName}</span>
          )}
        </span>
      </button>

      {props.people.length > 0 && (
        <div className="voice-roster flex flex-col gap-px border-t border-border/60 px-1.5 py-1.5">
          {props.people.map((entry) => (
            <div className="roster-row flex min-w-0 items-center gap-1.5" key={entry.id}>
              <button
                className={cn(
                  'roster-entry flex min-h-7 min-w-0 flex-1 items-center gap-2 rounded-sm px-1.5 py-1 text-left text-xs transition-colors',
                  'enabled:hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  entry.isSpeaking ? 'is-speaking text-foreground' : 'text-muted-foreground',
                )}
                type="button"
                disabled={entry.isLocal || !props.onOpenParticipant}
                aria-label={
                  entry.isLocal || !props.onOpenParticipant
                    ? entry.name
                    : `Audio options for ${entry.name}`
                }
                onContextMenu={(event) => {
                  event.preventDefault();
                  props.onOpenParticipant?.(entry, { x: event.clientX, y: event.clientY });
                }}
              >
                <Avatar
                  className="mini-avatar grid size-5.5 shrink-0 place-items-center overflow-hidden rounded-full text-[8px] font-extrabold text-background"
                  name={entry.name}
                  initials={entry.initials}
                  imageId={entry.avatarId}
                  accent={entry.accent}
                />
                <span className="roster-name min-w-0 flex-1 truncate">{entry.name}</span>
                {entry.isMuted && (
                  <MicOff aria-label={`${entry.name} is muted`} size={12} className="roster-flag shrink-0" />
                )}
                {entry.locallyMuted && (
                  <VolumeX
                    aria-label={`${entry.name} is silenced for you`}
                    size={12}
                    className="roster-flag shrink-0"
                  />
                )}
                <SignalBars signal={entry.signal} />
                {/* Not a waveform: this is their actual voice, now. */}
                <Pulse
                  bars={4}
                  className={cn('h-3.5 w-4', entry.isSpeaking ? 'text-success' : 'text-muted-foreground')}
                  participantId={entry.id}
                  speaking={entry.isSpeaking}
                />
              </button>
              {entry.isBroadcasting && <LiveBadge entry={entry} watching={props.watching} />}
            </div>
          ))}
        </div>
      )}

      <div className="voice-actions flex items-center gap-1.5 border-t border-border/60 p-1.5">
        <button
          className={cn(
            'voice-share flex h-8 min-w-0 flex-1 items-center justify-center gap-2 rounded-sm text-xs font-semibold transition-colors',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            props.screenSharing
              ? 'is-sharing bg-destructive/12 text-destructive hover:bg-destructive/20'
              : 'bg-secondary text-foreground hover:bg-accent',
          )}
          type="button"
          aria-label={props.screenSharing ? 'Stop sharing' : 'Share full screen'}
          onClick={props.onShare}
        >
          {props.screenSharing ? (
            <span className="size-1.5 shrink-0 rounded-full bg-destructive" />
          ) : (
            <MonitorUp size={14} />
          )}
          {props.screenSharing ? 'Stop sharing' : 'Share screen'}
        </button>
        <Tooltip label="Disconnect">
          <button
            className="grid size-8 shrink-0 place-items-center rounded-sm text-muted-foreground transition-colors hover:bg-destructive/12 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50"
            type="button"
            aria-label="Leave call"
            disabled={props.busy}
            onClick={props.onLeave}
          >
            <PhoneOff size={15} />
          </button>
        </Tooltip>
      </div>
    </section>
  );
}
