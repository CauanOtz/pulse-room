import { ChevronDown, Hash, Headphones, Mic, Radio, Settings, Volume2 } from 'lucide-react';
import type { ConnectionState } from '../domain/conference';

interface ChannelSidebarProps {
  connectionState: ConnectionState;
  participantCount: number;
  displayName: string;
  microphoneEnabled: boolean;
  deafened: boolean;
  onOpenSettings(): void;
}

export function ChannelSidebar(props: ChannelSidebarProps) {
  const isConnected = props.connectionState === 'connected' || props.connectionState === 'reconnecting';
  return (
    <aside className="channel-sidebar">
      <button className="server-heading" type="button">
        <span>After hours</span>
        <ChevronDown size={17} />
      </button>

      <div className="channel-scroll">
        <section className="channel-group">
          <h2>Text channels</h2>
          <button className="channel-row" type="button"><Hash size={17} /> general</button>
          <button className="channel-row" type="button"><Hash size={17} /> clips-and-chaos</button>
        </section>

        <section className="channel-group">
          <h2>Voice channels</h2>
          <button className="channel-row is-selected" type="button">
            <Volume2 size={17} /> Lounge
          </button>
          {isConnected && (
            <div className="voice-roster">
              <span className="mini-avatar coral">MA</span><span>Maya</span>
              <span className="mini-avatar blue">NO</span><span>Noah</span>
              <span className="mini-avatar green">LE</span><span>Leo</span>
            </div>
          )}
          <button className="channel-row" type="button"><Radio size={17} /> Game room</button>
        </section>
      </div>

      {isConnected && (
        <div className="connection-card">
          <div>
            <strong>{props.connectionState === 'reconnecting' ? 'Reconnecting' : 'Voice connected'}</strong>
            <span>Lounge · {props.participantCount} people</span>
          </div>
          <div className="signal-bars" aria-label="Good connection"><i /><i /><i /></div>
        </div>
      )}

      <div className="profile-strip">
        <span className="profile-avatar">{props.displayName.slice(0, 2).toUpperCase()}</span>
        <span className="profile-copy"><strong>{props.displayName}</strong><small>Ready</small></span>
        <Mic size={17} className={props.microphoneEnabled ? '' : 'is-off'} />
        <Headphones size={17} className={props.deafened ? 'is-off' : ''} />
        <button type="button" aria-label="Open audio settings" onClick={props.onOpenSettings}>
          <Settings size={17} />
        </button>
      </div>
    </aside>
  );
}
