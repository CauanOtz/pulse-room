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
    <section className="voice-panel flex flex-col gap-2 border-t border-border bg-card/60 p-2" aria-label="Voice status">
      <div className="voice-status flex items-center gap-2.5 px-1">
        <SignalBars
          always
          signal={props.signal ?? (reconnecting ? 'poor' : 'excellent')}
          className={cn('h-3.5', reconnecting || troubled ? 'text-destructive' : 'text-success')}
        />
        <div className="flex min-w-0 flex-1 flex-col leading-tight">
          <strong
            className={cn(
              'truncate text-[13px] font-semibold',
              reconnecting || troubled ? 'text-destructive' : 'text-success',
            )}
          >
            {heading}
          </strong>
          {/* The path reads the way you would say it out loud. */}
          <span className="truncate text-xs text-muted-foreground">
            {props.channelName}
            {props.serverName && <span className="text-muted-foreground/60"> / {props.serverName}</span>}
            {props.headcount !== undefined && (
              <span className="text-muted-foreground/60">
                {' '}
                · {props.headcount} {props.headcount === 1 ? 'person' : 'people'}
              </span>
            )}
          </span>
        </div>
        <Tooltip label="Disconnect">
          <button
            className="grid size-8 shrink-0 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50"
            type="button"
            aria-label="Leave call"
            disabled={props.busy}
            onClick={props.onLeave}
          >
            <PhoneOff size={17} />
          </button>
        </Tooltip>
      </div>

      <button
        className={cn(
          'voice-share flex h-9 w-full items-center justify-center gap-2 rounded-lg border border-border bg-secondary text-xs font-semibold text-foreground transition-colors',
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
          <MonitorUp size={16} />
        )}
        {props.screenSharing ? 'Stop sharing' : 'Share screen'}
      </button>
    </section>
  );
}
