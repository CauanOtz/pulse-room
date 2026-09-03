import { ChevronDown, Hash, Headphones, Mic, Radio, Settings, Volume2 } from 'lucide-react';
import type { ConnectionState, Participant, VoiceChannel } from '../domain/conference';

interface ChannelSidebarProps {
  connectionState: ConnectionState;
  channels: VoiceChannel[];
  activeChannelId: string;
  participants: Participant[];
  displayName: string;
  microphoneEnabled: boolean;
  deafened: boolean;
  busy: boolean;
  onSelectChannel(channelId: string): void;
  onOpenSettings(): void;
}

export function ChannelSidebar(props: ChannelSidebarProps) {
  const isConnected = props.connectionState === 'connected' || props.connectionState === 'reconnecting';
  const activeChannel = props.channels.find((channel) => channel.id === props.activeChannelId);

  return (
    <aside className="channel-sidebar">
      <button className="server-heading" type="button">
        <span>After hours</span>
        <ChevronDown size={17} />
      </button>

      <div className="channel-scroll">
        <section className="channel-group">
          <h2>Text channels</h2>
          <button className="channel-row" type="button" disabled><Hash size={17} /> general</button>
          <button className="channel-row" type="button" disabled><Hash size={17} /> clips-and-chaos</button>
          <p className="channel-note">Text chat is still to be built.</p>
        </section>

        <section className="channel-group">
          <h2>Voice channels</h2>
          {props.channels.map((channel, index) => (
            <div key={channel.id}>
              <button
                className={`channel-row${channel.id === props.activeChannelId ? ' is-selected' : ''}`}
                type="button"
                aria-current={channel.id === props.activeChannelId}
                disabled={props.busy}
                onClick={() => props.onSelectChannel(channel.id)}
              >
                {index === 0 ? <Volume2 size={17} /> : <Radio size={17} />} {channel.name}
              </button>

              {isConnected && channel.id === props.activeChannelId && props.participants.length > 0 && (
                <div className="voice-roster">
                  {props.participants.map((participant) => (
                    <span className="roster-entry" key={participant.id}>
                      <span className="mini-avatar" style={{ background: participant.accent }}>
                        {participant.initials}
                      </span>
                      {participant.name}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </section>
      </div>

      {isConnected && (
        <div className="connection-card">
          <div>
            <strong>{props.connectionState === 'reconnecting' ? 'Reconnecting' : 'Voice connected'}</strong>
            <span>{activeChannel?.name ?? props.activeChannelId} · {props.participants.length} people</span>
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
