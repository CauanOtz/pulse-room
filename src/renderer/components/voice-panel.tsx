import { ArrowUpRight, Info, MonitorUp, MonitorX, PhoneOff, Users } from 'lucide-react';
import { keysOf } from '../../shared/shortcuts';
import { cn } from './ui/utils';
import type { ConnectionReport, ConnectionState, SignalQuality } from '../domain/conference';
import { ConnectionDetails } from './connection-details';
import { SignalBars } from './signal-bars';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';
import { Tooltip } from './ui/tooltip';

interface VoicePanelProps {
  connectionState: ConnectionState;
  /** Where you are, in the order you would say it: room, then server. */
  channelName: string;
  serverName?: string;
  headcount?: number;
  /** Your own line, which is the one you can do something about. */
  signal?: SignalQuality;
  screenSharing: boolean;
  busy: boolean;
  /** Your own line to the voice server, opened from the status heading. */
  readConnection?(): Promise<ConnectionReport>;
  onLeave(): void;
  onReturn?(): void;
  onShare(): void;
}

/** The voice status block: where you are, how it sounds, and how to leave. */
export function VoicePanel(props: VoicePanelProps) {
  const reconnecting = props.connectionState === 'reconnecting';
  const troubled = props.signal === 'poor' || props.signal === 'lost';
  const heading = reconnecting
    ? 'Reconnecting'
    : props.signal === 'lost'
      ? 'Connection lost'
      : props.signal === 'poor'
        ? 'Poor connection'
        : 'Voice connected';

  return (
    <section className={cn('voice-panel', props.screenSharing && 'is-sharing')} aria-label="Voice status">
      <div className="voice-status">
        <ConnectionHeading
          heading={heading}
          troubled={reconnecting || troubled}
          signal={props.signal ?? (reconnecting ? 'poor' : 'excellent')}
          read={props.readConnection}
        />
        <div className="voice-actions">
          <Tooltip
            label={props.screenSharing ? 'Stop sharing' : 'Share your screen'}
            shortcut={keysOf('share')}
          >
            <button
              className={cn('voice-share voice-action', props.screenSharing && 'is-sharing')}
              type="button"
              aria-label={props.screenSharing ? 'Stop sharing' : 'Share full screen'}
              onClick={props.onShare}
            >
              {props.screenSharing ? <MonitorX size={16} /> : <MonitorUp size={16} />}
            </button>
          </Tooltip>
          <Tooltip label="Disconnect" shortcut={keysOf('leave')}>
            <button
              className="voice-action voice-leave"
              type="button"
              aria-label="Leave call"
              disabled={props.busy}
              onClick={props.onLeave}
            >
              <PhoneOff size={15} />
            </button>
          </Tooltip>
        </div>
      </div>
      <button
        className={cn('voice-where', props.onReturn ? 'is-link' : undefined)}
        type="button"
        aria-label={props.onReturn ? 'Return to call' : 'Current call'}
        disabled={!props.onReturn}
        onClick={props.onReturn}
      >
        {/* The path reads the way you would say it out loud. */}
        <span className="voice-where-name">{props.channelName}</span>
        {props.serverName && <span className="voice-where-server"> / {props.serverName}</span>}
        {props.headcount !== undefined && (
          <>
            <span className="sr-only">
              {' '}
              · {props.headcount} {props.headcount === 1 ? 'person' : 'people'}
            </span>
            <span className="voice-where-count font-mono" aria-hidden="true">
              {String(props.headcount).padStart(2, '0')}
              <Users size={11} />
            </span>
          </>
        )}
        {props.screenSharing && (
          <span className="voice-where-live">
            <i /> Live
          </span>
        )}
        {props.onReturn && <ArrowUpRight className="voice-where-go" size={13} aria-hidden="true" />}
      </button>
    </section>
  );
}

/**
 * The state of the call, which is also the way into the numbers behind it:
 * the same place Discord puts them, since that is where people look.
 */
function ConnectionHeading({
  heading,
  troubled,
  signal,
  read,
}: {
  heading: string;
  troubled: boolean;
  signal: SignalQuality;
  read?(): Promise<ConnectionReport>;
}) {
  const content = (
    <>
      <SignalBars
        always
        signal={signal}
        className={cn('h-3.5', troubled ? 'text-destructive' : 'text-success')}
      />
      <strong
        className={cn('truncate text-[13px] font-semibold', troubled ? 'text-destructive' : 'text-success')}
      >
        {heading}
      </strong>
    </>
  );
  if (!read) return <span className="flex min-w-0 items-center gap-2">{content}</span>;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          className="connection-heading flex min-w-0 items-center gap-2 self-start rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          type="button"
          aria-label={`${heading}: connection details`}
        >
          {content}
        </button>
      </PopoverTrigger>
      <PopoverContent
        side="top"
        align="start"
        sideOffset={14}
        className="connection-popover w-80 p-4"
        aria-label="Connection"
      >
        <header className="connection-head">
          <h3>Connection</h3>
          <Tooltip
            side="right"
            className="max-w-72 leading-relaxed"
            label="Audio starts to feel late from about 250 ms. Loss above 10% makes your voice sound robotic to everyone else. If both are low here and somebody still sounds choppy, the trouble is on their line."
          >
            <button type="button" className="connection-info" aria-label="What these numbers mean">
              <Info size={14} />
            </button>
          </Tooltip>
        </header>
        <ConnectionDetails read={read} />
      </PopoverContent>
    </Popover>
  );
}
