import { MonitorUp, PhoneOff } from 'lucide-react';
import { cn } from './ui/utils';
import type { ConnectionState, SignalQuality } from '../domain/conference';
import { SignalBars } from './signal-bars';
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
    <section
      className="voice-panel mx-2 mb-2 flex flex-col gap-2 rounded-lg border border-border bg-secondary/45 p-2.5 shadow-[var(--gloss)]"
      aria-label="Voice status"
    >
      <div className="voice-status flex items-center gap-1">
        <button
          className={cn(
            'group flex min-w-0 flex-1 items-center gap-2.5 px-1 py-0.5 text-left',
            props.onReturn
              ? 'cursor-pointer focus-visible:outline-none'
              : 'cursor-default',
          )}
          type="button"
          aria-label={props.onReturn ? 'Return to call' : 'Current call'}
          disabled={!props.onReturn}
          onClick={props.onReturn}
        >
          <SignalBars
            always
            signal={props.signal ?? (reconnecting ? 'poor' : 'excellent')}
            className={cn('h-3.5', reconnecting || troubled ? 'text-destructive' : 'text-success')}
          />
          <span className="flex min-w-0 flex-1 flex-col leading-tight">
            <strong
              className={cn(
                'truncate text-[13px] font-semibold',
                reconnecting || troubled ? 'text-destructive' : 'text-success',
              )}
            >
              {heading}
            </strong>
            {/* The path reads the way you would say it out loud. */}
            <span className="truncate text-xs text-muted-foreground group-hover:underline group-focus-visible:underline [text-underline-offset:3px]">
              {props.channelName}
              {props.serverName && (
                <span className="text-muted-foreground/60"> / {props.serverName}</span>
              )}
              {props.headcount !== undefined && (
                <span className="text-muted-foreground/60">
                  {' '}
                  · {props.headcount} {props.headcount === 1 ? 'person' : 'people'}
                </span>
              )}
            </span>
          </span>
        </button>
        <Tooltip label="Disconnect">
          <button
            className="grid size-7.5 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50"
            type="button"
            aria-label="Leave call"
            disabled={props.busy}
            onClick={props.onLeave}
          >
            <PhoneOff size={15} />
          </button>
        </Tooltip>
      </div>

      <button
        className={cn(
          'voice-share flex h-8 w-full items-center justify-center gap-2 rounded-md border border-border bg-card/70 text-xs font-semibold text-foreground transition-colors',
          'hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          props.screenSharing && 'is-sharing border-destructive/40 bg-destructive/12 text-destructive',
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
    </section>
  );
}
