import { MonitorUp, PhoneOff, Signal } from 'lucide-react';
import { cn } from './ui/utils';
import type { ConnectionState } from '../domain/conference';

interface VoicePanelProps {
  connectionState: ConnectionState;
  channelName: string;
  screenSharing: boolean;
  busy: boolean;
  onLeave(): void;
  onShare(): void;
}

/** The voice status block: where you are, how to go live, and how to leave. */
export function VoicePanel(props: VoicePanelProps) {
  const reconnecting = props.connectionState === 'reconnecting';

  return (
    <section className="voice-panel flex flex-col gap-2 border-t border-border bg-card/60 p-2" aria-label="Voice status">
      <div className="voice-status flex items-center gap-2 px-1 [&>div]:flex [&>div]:min-w-0 [&>div]:flex-1 [&>div]:flex-col [&_strong]:text-[13px] [&_strong]:font-semibold [&_strong]:text-success [&_span]:truncate [&_span]:text-xs [&_span]:text-muted-foreground">
        <Signal size={17} className={reconnecting ? 'is-waiting text-muted-foreground' : 'is-live text-success'} />
        <div>
          <strong>{reconnecting ? 'Reconnecting' : 'Voice connected'}</strong>
          <span>{props.channelName}</span>
        </div>
        <button
          className="grid size-8 shrink-0 place-items-center rounded-lg text-destructive transition-colors hover:bg-destructive/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50"
          type="button"
          aria-label="Leave call"
          title="Disconnect"
          disabled={props.busy}
          onClick={props.onLeave}
        >
          <PhoneOff size={17} />
        </button>
      </div>

      <button
        className={cn(
          'voice-share flex h-9 w-full items-center justify-center gap-2 rounded-lg border border-border bg-secondary text-xs font-semibold text-foreground transition-colors',
          'hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          props.screenSharing && 'is-sharing border-success/40 bg-success/15 text-success',
        )}
        type="button"
        aria-label={props.screenSharing ? 'Stop sharing' : 'Share full screen'}
        onClick={props.onShare}
      >
        <MonitorUp size={16} />
        {props.screenSharing ? 'Stop sharing' : 'Share screen'}
      </button>
    </section>
  );
}
