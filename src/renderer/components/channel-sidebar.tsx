import { useState, type ReactNode } from 'react';
import {
  ChevronDown,
  Hash,
  LockKeyhole,
  Plus,
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
import { Button } from './ui/button';
import { Tooltip } from './ui/tooltip';
import { cn } from './ui/utils';
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
  joined: boolean;
  busy: boolean;
  screenSharing: boolean;
  occupancy: ChannelOccupancy[];
  avatars?: ReadonlyMap<string, string | null | undefined>;
  onSelectChannel(channelId: string): void;
  onLeave(): void;
  onShare(): void;
  onOpenParticipant(entry: RosterEntry, position: { x: number; y: number }): void;
  /** Absent for anyone who may not shape the server, which hides the controls. */
  onCreateChannel?(type: 'text' | 'voice'): void;
  onEditChannel?(channelId: string): void;
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
    <aside className="channel-sidebar relative flex min-w-0 flex-col bg-sidebar text-sidebar-foreground">
      <button
        className="server-heading flex h-12 flex-none items-center justify-between gap-2 border-b border-border px-3.5 text-[15px] font-semibold transition-colors hover:bg-accent"
        type="button"
        onClick={props.onManage}
        aria-label={props.serverName ? 'Server settings and members' : undefined}
      >
        <span className="min-w-0 truncate">{props.serverName ?? 'After hours'}</span>
        <ChevronDown size={17} />
      </button>

      <div className="channel-scroll flex-1 overflow-y-auto px-2 py-3.5">
        <section className="channel-group mb-4 flex flex-col gap-0.5">
          <GroupHeading
            label="Text channels"
            createLabel="Create text channel"
            onCreate={
              props.textChannels && props.onCreateChannel && (() => props.onCreateChannel?.('text'))
            }
          />
          {props.textChannels ? (
            props.textChannels.map((channel) => (
              <ChannelRow
                key={channel.id}
                icon={<Hash size={17} />}
                name={channel.name}
                isPrivate={channel.private}
                selected={props.selectedTextId === channel.id}
                onSelect={() => props.onSelectText?.(channel.id)}
                onEdit={props.onEditChannel && (() => props.onEditChannel?.(channel.id))}
              />
            ))
          ) : (
            <>
              <button className={cn(
                  'channel-row flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm text-muted-foreground transition-colors',
                  'hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  'disabled:pointer-events-none disabled:opacity-45',
                )} type="button" disabled>
                <Hash size={17} /> general
              </button>
              <button className={cn(
                  'channel-row flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm text-muted-foreground transition-colors',
                  'hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  'disabled:pointer-events-none disabled:opacity-45',
                )} type="button" disabled>
                <Hash size={17} /> clips-and-chaos
              </button>
              <p className="channel-note mt-1 px-2 text-[10px] text-muted-foreground">Text chat is still to be built.</p>
            </>
          )}
        </section>

        <section className="channel-group mb-4 flex flex-col gap-0.5">
          <GroupHeading
            label="Voice channels"
            createLabel="Create voice channel"
            onCreate={props.onCreateChannel && (() => props.onCreateChannel?.('voice'))}
          />
          {props.channels.map((channel, index) => (
            <div key={channel.id}>
              <ChannelRow
                icon={index === 0 ? <Volume2 size={17} /> : <Radio size={17} />}
                name={channel.name}
                isPrivate={channel.private}
                selected={isConnected && channel.id === props.activeChannelId}
                current={isConnected && channel.id === props.activeChannelId}
                disabled={props.busy}
                onSelect={() => props.onSelectChannel(channel.id)}
                onEdit={props.onEditChannel && (() => props.onEditChannel?.(channel.id))}
              />

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

    </aside>
  );
}

/**
 * A group of channels, with the one control that makes another. The plus is
 * drawn only for somebody who may use it.
 */
function GroupHeading({
  label,
  createLabel,
  onCreate,
}: {
  label: string;
  createLabel: string;
  onCreate?: false | undefined | (() => void);
}) {
  return (
    <div className="channel-heading flex items-center justify-between gap-2 pb-1 pl-2 pr-1">
      <h2 className="min-w-0 truncate text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </h2>
      {onCreate && (
        <Tooltip label={createLabel}>
          <button
            className="grid size-5 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            type="button"
            aria-label={createLabel}
            onClick={onCreate}
          >
            <Plus size={15} />
          </button>
        </Tooltip>
      )}
    </div>
  );
}

/**
 * One channel. Its settings are reached by the gear the row shows under the
 * pointer, so a name is never squeezed by a control nobody is looking for.
 */
function ChannelRow({
  icon,
  name,
  isPrivate,
  selected,
  current,
  disabled,
  onSelect,
  onEdit,
}: {
  icon: ReactNode;
  name: string;
  isPrivate?: boolean;
  selected?: boolean;
  current?: boolean;
  disabled?: boolean;
  onSelect(): void;
  onEdit?: false | undefined | (() => void);
}) {
  return (
    <div className="channel-item group/channel relative">
      <button
        className={cn(
          'channel-row flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm text-muted-foreground transition-colors',
          'hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          'disabled:pointer-events-none disabled:opacity-45',
          // The gear keeps its place whether or not it is drawn, so a name
          // never changes length under the pointer.
          onEdit && 'pr-9',
          selected && 'is-selected bg-accent text-foreground',
        )}
        type="button"
        aria-current={current}
        disabled={disabled}
        onClick={onSelect}
      >
        {icon}
        <span className="channel-name min-w-0 flex-1 truncate">{name}</span>
        {isPrivate && <LockKeyhole aria-label="Private" className="size-3.5 shrink-0" />}
      </button>
      {onEdit && (
        <Tooltip label="Edit channel">
          <button
            className={cn(
              'channel-edit absolute right-1 top-1/2 grid size-7 -translate-y-1/2 place-items-center rounded-md',
              'text-muted-foreground opacity-0 transition-opacity hover:bg-secondary hover:text-foreground',
              'group-hover/channel:opacity-100 focus-visible:opacity-100',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            )}
            type="button"
            aria-label={`Edit ${name}`}
            onClick={onEdit}
          >
            <Settings size={15} />
          </button>
        </Tooltip>
      )}
    </div>
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
    <div className="voice-roster mb-2 ml-6 flex flex-col gap-1">
      {entries.map((entry) => (
        <button
          className={cn(
            'roster-entry flex w-full items-center gap-2 rounded-lg px-1.5 py-1 text-left text-xs text-muted-foreground transition-colors',
            'enabled:hover:bg-accent enabled:hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            entry.isSpeaking && 'is-speaking text-foreground',
          )}
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
            className="mini-avatar grid size-5 shrink-0 place-items-center overflow-hidden rounded-md text-[8px] font-extrabold text-background"
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
