import { ChevronDown, Hash, Headphones, Mic, MicOff, Radio, Settings, Volume2, VolumeX } from 'lucide-react';
import type { ConnectionState, Participant, VoiceChannel } from '../domain/conference';
import { channelRoster, type ChannelOccupancy, type RosterEntry } from '../domain/roster';

interface ChannelSidebarProps {
  connectionState: ConnectionState;
  channels: VoiceChannel[];
  activeChannelId: string;
  participants: Participant[];
  displayName: string;
  microphoneEnabled: boolean;
  deafened: boolean;
  busy: boolean;
  occupancy: ChannelOccupancy[];
  onSelectChannel(channelId: string): void;
  onOpenParticipant(entry: RosterEntry, position: { x: number; y: number }): void;
  onOpenSettings(): void;
}

export function ChannelSidebar(props: ChannelSidebarProps) {
  const isConnected = props.connectionState === 'connected' || props.connectionState === 'reconnecting';
  const activeChannel = props.channels.find((channel) => channel.id === props.activeChannelId);
  const rosterOf = (channelId: string) =>
    channelRoster(
      channelId,
      isConnected ? props.activeChannelId : '',
      props.participants,
      props.occupancy,
    );

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

              <ChannelRoster entries={rosterOf(channel.id)} onOpenParticipant={props.onOpenParticipant} />
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

function ChannelRoster({
  entries,
  onOpenParticipant,
}: {
  entries: RosterEntry[];
  onOpenParticipant(entry: RosterEntry, position: { x: number; y: number }): void;
}) {
  if (entries.length === 0) return null;

  return (
    <div className="voice-roster">
      {entries.map((entry) => (
        <button
          className={`roster-entry${entry.isSpeaking ? ' is-speaking' : ''}`}
          key={entry.id}
          type="button"
          disabled={!entry.detailed || entry.isLocal}
          aria-label={entry.detailed && !entry.isLocal ? `Audio options for ${entry.name}` : entry.name}
          onContextMenu={(event) => {
            event.preventDefault();
            onOpenParticipant(entry, { x: event.clientX, y: event.clientY });
          }}
        >
          <span className="mini-avatar" style={{ background: entry.accent }}>{entry.initials}</span>
          <span className="roster-name">{entry.name}</span>
          {entry.isMuted && <MicOff size={13} className="roster-flag" />}
          {entry.locallyMuted && <VolumeX size={13} className="roster-flag" />}
        </button>
      ))}
    </div>
  );
}
