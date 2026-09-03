import { MonitorUp, PhoneOff, Signal } from 'lucide-react';
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
    <section className="voice-panel" aria-label="Voice status">
      <div className="voice-status">
        <Signal size={17} className={reconnecting ? 'is-waiting' : 'is-live'} />
        <div>
          <strong>{reconnecting ? 'Reconnecting' : 'Voice connected'}</strong>
          <span>{props.channelName}</span>
        </div>
        <button type="button" aria-label="Leave call" title="Disconnect" disabled={props.busy} onClick={props.onLeave}>
          <PhoneOff size={17} />
        </button>
      </div>

      <button
        className={`voice-share${props.screenSharing ? ' is-sharing' : ''}`}
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
