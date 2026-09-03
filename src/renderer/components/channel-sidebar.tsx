import { useState } from 'react';
import {
  ChevronDown,
  ChevronUp,
  Hash,
  Headphones,
  Mic,
  MicOff,
  Radio,
  Settings,
  Volume2,
  VolumeX,
} from 'lucide-react';
import type { ConnectionState, Participant, VoiceChannel } from '../domain/conference';
import { channelRoster, type ChannelOccupancy, type RosterEntry } from '../domain/roster';
import type { AvailableMediaDevices } from '../infrastructure/media/media-devices-service';
import { DeviceMenu } from './device-menu';
import { VoicePanel } from './voice-panel';
import type { CommunityChannel } from '../../shared/community';

interface ChannelSidebarProps {
  serverName?: string;
  textChannels?: CommunityChannel[];
  selectedTextId?: string;
  onSelectText?(id: string): void;
  onManage?(): void;
  connectionState: ConnectionState;
  channels: VoiceChannel[];
  activeChannelId: string;
  participants: Participant[];
  displayName: string;
  microphoneEnabled: boolean;
  deafened: boolean;
  joined: boolean;
  busy: boolean;
  screenSharing: boolean;
  devices: AvailableMediaDevices;
  microphoneDeviceId?: string;
  speakerDeviceId?: string;
  occupancy: ChannelOccupancy[];
  onSelectChannel(channelId: string): void;
  onToggleMicrophone(): void;
  onToggleDeafen(): void;
  onSelectMicrophone(deviceId?: string): void;
  onSelectSpeaker(deviceId?: string): void;
  onLeave(): void;
  onShare(): void;
  onOpenParticipant(entry: RosterEntry, position: { x: number; y: number }): void;
  onOpenSettings(): void;
}

export function ChannelSidebar(props: ChannelSidebarProps) {
  const [openMenu, setOpenMenu] = useState<'microphone' | 'speaker'>();
  const isConnected = props.connectionState === 'connected' || props.connectionState === 'reconnecting';
  const activeChannel = props.channels.find((channel) => channel.id === props.activeChannelId);
  const rosterOf = (channelId: string) =>
    channelRoster(channelId, isConnected ? props.activeChannelId : '', props.participants, props.occupancy);

  return (
    <aside className="channel-sidebar">
      <button
        className="server-heading"
        type="button"
        onClick={props.onManage}
        aria-label={props.serverName ? 'Server settings and members' : undefined}
      >
        <span>{props.serverName ?? 'After hours'}</span>
        <ChevronDown size={17} />
      </button>

      <div className="channel-scroll">
        <section className="channel-group">
          <h2>Text channels</h2>
          {props.textChannels ? (
            props.textChannels.map((channel) => (
              <button
                key={channel.id}
                className={`channel-row${props.selectedTextId === channel.id ? ' is-selected' : ''}`}
                type="button"
                onClick={() => props.onSelectText?.(channel.id)}
              >
                <Hash size={17} />
                {channel.name}
                {channel.private && <small>Private</small>}
              </button>
            ))
          ) : (
            <>
              <button className="channel-row" type="button" disabled>
                <Hash size={17} /> general
              </button>
              <button className="channel-row" type="button" disabled>
                <Hash size={17} /> clips-and-chaos
              </button>
              <p className="channel-note">Text chat is still to be built.</p>
            </>
          )}
        </section>

        <section className="channel-group">
          <h2>Voice channels</h2>
          {props.channels.map((channel, index) => (
            <div key={channel.id}>
              <button
                className={`channel-row${isConnected && channel.id === props.activeChannelId ? ' is-selected' : ''}`}
                type="button"
                aria-current={isConnected && channel.id === props.activeChannelId}
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
        <VoicePanel
          connectionState={props.connectionState}
          channelName={`${activeChannel?.name ?? props.activeChannelId} · ${props.participants.length} people`}
          screenSharing={props.screenSharing}
          busy={props.busy}
          onLeave={props.onLeave}
          onShare={props.onShare}
        />
      )}

      <div className="profile-strip">
        <span className="profile-avatar">{props.displayName.slice(0, 2).toUpperCase()}</span>
        <span className="profile-copy">
          <strong>{props.displayName}</strong>
          <small>{props.joined ? 'In voice' : 'Ready'}</small>
        </span>
        <span className="device-control">
          <button
            type="button"
            disabled={!props.joined || props.busy}
            aria-label={props.microphoneEnabled ? 'Mute microphone' : 'Unmute microphone'}
            onClick={props.onToggleMicrophone}
          >
            {props.joined && !props.microphoneEnabled ? (
              <MicOff size={17} className="is-off" />
            ) : (
              <Mic size={17} />
            )}
          </button>
          <button
            className="device-caret"
            type="button"
            aria-label="Choose microphone"
            aria-expanded={openMenu === 'microphone'}
            onClick={() => setOpenMenu(openMenu === 'microphone' ? undefined : 'microphone')}
          >
            {openMenu === 'microphone' ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          </button>
        </span>

        <span className="device-control">
          <button
            type="button"
            disabled={!props.joined || props.busy}
            aria-label="Toggle deafen"
            onClick={props.onToggleDeafen}
          >
            <Headphones size={17} className={props.deafened ? 'is-off' : ''} />
          </button>
          <button
            className="device-caret"
            type="button"
            aria-label="Choose speakers"
            aria-expanded={openMenu === 'speaker'}
            onClick={() => setOpenMenu(openMenu === 'speaker' ? undefined : 'speaker')}
          >
            {openMenu === 'speaker' ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          </button>
        </span>

        <button type="button" aria-label="Open audio settings" onClick={props.onOpenSettings}>
          <Settings size={17} />
        </button>
      </div>

      {openMenu === 'microphone' && (
        <DeviceMenu
          title="Microphone"
          devices={props.devices.microphones}
          selectedId={props.microphoneDeviceId}
          onSelect={props.onSelectMicrophone}
          onClose={() => setOpenMenu(undefined)}
        />
      )}
      {openMenu === 'speaker' && (
        <DeviceMenu
          title="Speakers"
          devices={props.devices.speakers}
          selectedId={props.speakerDeviceId}
          onSelect={props.onSelectSpeaker}
          onClose={() => setOpenMenu(undefined)}
        />
      )}
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
          <span className="mini-avatar" style={{ background: entry.accent }}>
            {entry.initials}
          </span>
          <span className="roster-name">{entry.name}</span>
          {entry.isMuted && <MicOff size={13} className="roster-flag" />}
          {entry.locallyMuted && <VolumeX size={13} className="roster-flag" />}
        </button>
      ))}
    </div>
  );
}
