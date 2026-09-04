import { useState } from 'react';
import {
  ChevronDown,
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
import { Avatar } from './avatar';
import type { AvailableMediaDevices } from '../infrastructure/media/media-devices-service';
import { DeviceMenu } from './device-menu';
import { ThemeToggle } from './theme-toggle';
import { Button } from './ui/button';
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
  avatars?: ReadonlyMap<string, string | null | undefined>;
  avatarId?: string | null;
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
  const isConnected = props.connectionState === 'connected' || props.connectionState === 'reconnecting';
  const activeChannel = props.channels.find((channel) => channel.id === props.activeChannelId);
  const rosterOf = (channelId: string) =>
    channelRoster(
      channelId,
      isConnected ? props.activeChannelId : '',
      props.participants,
      props.occupancy,
      props.avatars,
    );

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
                <span className="channel-name">{channel.name}</span>
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
                {index === 0 ? <Volume2 size={17} /> : <Radio size={17} />}{' '}
                <span className="channel-name">{channel.name}</span>
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

      <div className="profile-strip flex flex-col gap-2 border-t border-border bg-sidebar px-3 py-2.5">
        <div className="flex items-center gap-2.5">
          <Avatar
            className="grid size-9 shrink-0 place-items-center rounded-xl bg-secondary text-[11px] font-bold text-secondary-foreground"
            name={props.displayName}
            imageId={props.avatarId}
          />
          <span className="profile-copy flex min-w-0 flex-col leading-tight">
            <strong className="truncate text-[13px] font-semibold" title={props.displayName}>
              {props.displayName}
            </strong>
            <small className="truncate text-[11px] text-muted-foreground">
              {props.joined ? 'In voice' : 'Ready'}
            </small>
          </span>
        </div>

        <div className="flex items-center gap-1">
          <span className="device-control flex items-center rounded-lg bg-secondary/70">
            <Button
              variant="ghost"
              size="icon-sm"
              className="size-8 rounded-r-none"
              disabled={!props.joined || props.busy}
              aria-label={props.microphoneEnabled ? 'Mute microphone' : 'Unmute microphone'}
              onClick={props.onToggleMicrophone}
            >
              {props.joined && !props.microphoneEnabled ? (
                <MicOff className="size-4 text-destructive" />
              ) : (
                <Mic className="size-4" />
              )}
            </Button>
            <DeviceMenu
              title="Microphone"
              label="Choose microphone"
              devices={props.devices.microphones}
              selectedId={props.microphoneDeviceId}
              onSelect={props.onSelectMicrophone}
            />
          </span>

          <span className="device-control flex items-center rounded-lg bg-secondary/70">
            <Button
              variant="ghost"
              size="icon-sm"
              className="size-8 rounded-r-none"
              disabled={!props.joined || props.busy}
              aria-label="Toggle deafen"
              onClick={props.onToggleDeafen}
            >
              <Headphones className={props.deafened ? 'size-4 text-destructive' : 'size-4'} />
            </Button>
            <DeviceMenu
              title="Speakers"
              label="Choose speakers"
              devices={props.devices.speakers}
              selectedId={props.speakerDeviceId}
              onSelect={props.onSelectSpeaker}
            />
          </span>

          <span className="ml-auto flex items-center gap-1">
            <ThemeToggle className="size-8" />
            <Button
              variant="ghost"
              size="icon-sm"
              className="size-8"
              aria-label="Open audio settings"
              onClick={props.onOpenSettings}
            >
              <Settings className="size-4" />
            </Button>
          </span>
        </div>
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
          <Avatar
            className="mini-avatar"
            name={entry.name}
            initials={entry.initials}
            imageId={entry.avatarId}
            accent={entry.accent}
          />
          <span className="roster-name">{entry.name}</span>
          {entry.isMuted && <MicOff size={13} className="roster-flag" />}
          {entry.locallyMuted && <VolumeX size={13} className="roster-flag" />}
        </button>
      ))}
    </div>
  );
}
