import { useState, type ReactNode } from 'react';
import {
  ChevronDown,
  ChevronRight,
  FolderPlus,
  Hash,
  LockKeyhole,
  Plus,
  Headphones,
  Mic,
  MicOff,
  Radio,
  Tv,
  Settings,
  Volume2,
  VolumeX,
} from 'lucide-react';
import type { ConnectionState, Participant, VoiceChannel } from '../domain/conference';
import { accountOf, channelRoster, type ChannelOccupancy, type RosterEntry } from '../domain/roster';
import { Avatar } from './avatar';
import { TagChip } from './profile-identity';
import { SignalBars } from './signal-bars';
import { MediaOutput } from './media-output';
import { HoverCard, HoverCardContent, HoverCardTrigger } from './ui/hover-card';
import type { AvailableMediaDevices } from '../infrastructure/media/media-devices-service';
import { DeviceMenu } from './device-menu';
import { Button } from './ui/button';
import { Tooltip } from './ui/tooltip';
import { cn } from './ui/utils';
import { VoicePanel } from './voice-panel';
import type { CommunityChannel, WornTag } from '../../shared/community';

interface ChannelSidebarProps {
  serverName?: string;
  textChannels?: CommunityChannel[];
  selectedTextId?: string;
  onSelectText?(id: string): void;
  onManage?(): void;
  connectionState: ConnectionState;
  channels: VoiceChannel[];
  activeChannelId: string;
  /** The call can belong to a server other than the one being browsed. */
  connectedChannelName?: string;
  connectedServerName?: string;
  participants: Participant[];
  joined: boolean;
  busy: boolean;
  screenSharing: boolean;
  occupancy: ChannelOccupancy[];
  avatars?: ReadonlyMap<string, string | null | undefined>;
  /** The server tag each account wears, drawn beside their name in a room. */
  tags?: ReadonlyMap<string, WornTag>;
  onSelectChannel(channelId: string): void;
  onLeave(): void;
  onReturnToCall?(): void;
  onShare(): void;
  onOpenParticipant(entry: RosterEntry, position: { x: number; y: number }): void;
  onOpenProfile?(identity: string, position: { x: number; y: number }): void;
  /** Headings channels can be gathered under; the rest are listed by type. */
  categories?: { id: string; name: string }[];
  /** Absent for anyone who may not shape the server, which hides the controls. */
  onCreateChannel?(type: 'text' | 'voice', categoryId?: string): void;
  onEditChannel?(channelId: string): void;
  onCreateCategory?(): void;
  onEditCategory?(categoryId: string): void;
  /** Whose screens this client asked for, and how to ask for another. */
  watching?: string[];
  onWatch?(participantId: string, watching: boolean): void;
  /** Borrows a screen while it is being glanced at, and gives it back. */
  onPreview?(participantId?: string): void;
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
  const categories = props.categories ?? [];
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(() => new Set());
  const listed = (categoryId?: string | null) => Boolean(categoryId && categories.some((c) => c.id === categoryId));
  const looseText = props.textChannels?.filter((channel) => !listed(channel.categoryId));
  const looseVoice = props.channels.filter((channel) => !listed(channel.categoryId));

  const textRow = (channel: CommunityChannel) => (
    <ChannelRow
      key={channel.id}
      icon={<Hash size={15} />}
      name={channel.name}
      isPrivate={channel.private}
      selected={props.selectedTextId === channel.id}
      onSelect={() => props.onSelectText?.(channel.id)}
      onEdit={props.onEditChannel && (() => props.onEditChannel?.(channel.id))}
    />
  );
  const voiceRow = (channel: VoiceChannel, icon: ReactNode) => (
    <div key={channel.id}>
      <ChannelRow
        icon={icon}
        name={channel.name}
        isPrivate={channel.private}
        selected={isConnected && channel.id === props.activeChannelId}
        current={isConnected && channel.id === props.activeChannelId}
        disabled={props.busy}
        onSelect={() => props.onSelectChannel(channel.id)}
        onEdit={props.onEditChannel && (() => props.onEditChannel?.(channel.id))}
      />

      <ChannelRoster
        tags={props.tags}
        entries={rosterOf(channel.id)}
        watching={props.watching}
        onOpenParticipant={props.onOpenParticipant}
        onOpenProfile={props.onOpenProfile}
        onWatch={props.onWatch}
        onPreview={props.onPreview}
      />
    </div>
  );

  return (
    <aside className="channel-sidebar relative flex min-w-0 flex-col bg-sidebar text-sidebar-foreground">
      <button
        className="server-heading flex h-13 flex-none items-center justify-between gap-2 border-b border-border px-3.5 text-sm font-semibold transition-colors hover:bg-accent"
        type="button"
        onClick={props.onManage}
        aria-label={props.serverName ? 'Server settings and members' : undefined}
      >
        <span className="min-w-0 truncate">{props.serverName ?? 'After hours'}</span>
        <i className="grid size-6 place-items-center rounded-md text-muted-foreground not-italic transition-colors">
          <ChevronDown size={14} />
        </i>
      </button>

      <div className="channel-scroll flex-1 overflow-y-auto px-2 py-3">
        <section className="channel-group mb-5 flex flex-col gap-0.5">
          <GroupHeading
            label="Text channels"
            createLabel="Create text channel"
            onCreate={props.textChannels && props.onCreateChannel && (() => props.onCreateChannel?.('text'))}
          />
          {looseText ? (
            looseText.map(textRow)
          ) : (
            <>
              <button
                className={cn(
                  'channel-row relative flex h-8.5 w-full items-center gap-2 rounded-md px-2.5 text-left text-[13px] text-muted-foreground transition-colors',
                  'hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  'disabled:pointer-events-none disabled:opacity-45',
                )}
                type="button"
                disabled
              >
                <Hash size={15} /> general
              </button>
              <button
                className={cn(
                  'channel-row relative flex h-8.5 w-full items-center gap-2 rounded-md px-2.5 text-left text-[13px] text-muted-foreground transition-colors',
                  'hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  'disabled:pointer-events-none disabled:opacity-45',
                )}
                type="button"
                disabled
              >
                <Hash size={15} /> clips-and-chaos
              </button>
              <p className="channel-note mt-1 px-2 text-[10px] text-muted-foreground">
                Text chat is still to be built.
              </p>
            </>
          )}
        </section>

        <section className="channel-group mb-4 flex flex-col gap-0.5">
          <GroupHeading
            label="Voice channels"
            createLabel="Create voice channel"
            onCreate={props.onCreateChannel && (() => props.onCreateChannel?.('voice'))}
          />
          {looseVoice.map((channel, index) =>
            voiceRow(channel, index === 0 ? <Volume2 size={15} /> : <Radio size={15} />),
          )}
        </section>

        {categories.map((category) => {
          const text = props.textChannels?.filter((channel) => channel.categoryId === category.id) ?? [];
          const voice = props.channels.filter((channel) => channel.categoryId === category.id);
          const isCollapsed = collapsed.has(category.id);
          // A folded category still shows the channel you are in, so folding
          // never hides where you are.
          const shownText = isCollapsed ? text.filter((channel) => channel.id === props.selectedTextId) : text;
          const shownVoice = isCollapsed
            ? voice.filter((channel) => isConnected && channel.id === props.activeChannelId)
            : voice;
          return (
            <section className="channel-group channel-category mb-4 flex flex-col gap-0.5" key={category.id}>
              <CategoryHeading
                name={category.name}
                collapsed={isCollapsed}
                onToggle={() =>
                  setCollapsed((current) => {
                    const next = new Set(current);
                    if (next.has(category.id)) next.delete(category.id);
                    else next.add(category.id);
                    return next;
                  })
                }
                onCreate={props.onCreateChannel && (() => props.onCreateChannel?.('text', category.id))}
                onEdit={props.onEditCategory && (() => props.onEditCategory?.(category.id))}
              />
              {shownText.map(textRow)}
              {shownVoice.map((channel) => voiceRow(channel, <Volume2 size={15} />))}
            </section>
          );
        })}

        {props.onCreateCategory && (
          <button
            className="create-category mt-1 flex h-8 w-full items-center gap-2 rounded-md px-2.5 text-left text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            type="button"
            onClick={props.onCreateCategory}
          >
            <FolderPlus size={14} /> Create category
          </button>
        )}
      </div>

      {isConnected && (
        <VoicePanel
          connectionState={props.connectionState}
          channelName={props.connectedChannelName ?? activeChannel?.name ?? props.activeChannelId}
          serverName={props.connectedServerName ?? props.serverName}
          headcount={props.participants.length}
          signal={props.participants.find((participant) => participant.isLocal)?.signal}
          screenSharing={props.screenSharing}
          busy={props.busy}
          onLeave={props.onLeave}
          onReturn={props.onReturnToCall}
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
    <div className="channel-heading flex h-7 items-center justify-between gap-2 pl-2 pr-1">
      <h2 className="min-w-0 truncate text-[11px] font-semibold text-muted-foreground">{label}</h2>
      {onCreate && (
        <Tooltip label={createLabel}>
          <button
            className="grid size-6 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            type="button"
            aria-label={createLabel}
            onClick={onCreate}
          >
            <Plus size={14} />
          </button>
        </Tooltip>
      )}
    </div>
  );
}

/**
 * A category's name, which folds it away; beside it the plus that makes a
 * channel in it and the gear for its own settings, both only for somebody who
 * may use them.
 */
function CategoryHeading({
  name,
  collapsed,
  onToggle,
  onCreate,
  onEdit,
}: {
  name: string;
  collapsed: boolean;
  onToggle(): void;
  onCreate?: false | undefined | (() => void);
  onEdit?: false | undefined | (() => void);
}) {
  return (
    <div className="channel-heading group/category flex h-7 items-center justify-between gap-1 pl-0.5 pr-1">
      <button
        className="flex min-w-0 flex-1 items-center gap-1 rounded-md py-1 text-left text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        type="button"
        aria-expanded={!collapsed}
        onClick={onToggle}
      >
        {collapsed ? <ChevronRight className="size-3 shrink-0" /> : <ChevronDown className="size-3 shrink-0" />}
        <span className="min-w-0 truncate">{name}</span>
      </button>
      {onEdit && (
        <Tooltip label="Edit category">
          <button
            className="grid size-6 shrink-0 place-items-center rounded-md text-muted-foreground opacity-0 transition-[opacity,color] hover:text-foreground group-hover/category:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            type="button"
            aria-label={`Edit ${name}`}
            onClick={onEdit}
          >
            <Settings size={13} />
          </button>
        </Tooltip>
      )}
      {onCreate && (
        <Tooltip label={`Create channel in ${name}`}>
          <button
            className="grid size-6 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            type="button"
            aria-label={`Create channel in ${name}`}
            onClick={onCreate}
          >
            <Plus size={14} />
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
          'channel-row relative flex h-8.5 w-full items-center gap-2 rounded-md px-2.5 text-left text-[13px] text-muted-foreground transition-colors',
          'group-hover/channel:bg-accent group-hover/channel:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          'disabled:pointer-events-none disabled:opacity-45',
          // The gear keeps its place whether or not it is drawn, so a name
          // never changes length under the pointer.
          onEdit && 'pr-9',
          selected && 'is-selected bg-accent/60 text-foreground',
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
              'channel-edit absolute right-1 top-1/2 grid size-6.5 -translate-y-1/2 place-items-center',
              'text-muted-foreground opacity-0 transition-[opacity,color] hover:text-foreground',
              'group-hover/channel:opacity-100 focus-visible:opacity-100',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            )}
            type="button"
            aria-label={`Edit ${name}`}
            // Reaching for the settings of a channel is not asking to enter it.
            onClick={(event) => {
              event.stopPropagation();
              onEdit();
            }}
          >
            <Settings size={13} />
          </button>
        </Tooltip>
      )}
    </div>
  );
}

function ChannelRoster({
  entries,
  tags,
  watching,
  onOpenParticipant,
  onOpenProfile,
  onWatch,
  onPreview,
}: {
  entries: RosterEntry[];
  watching?: string[];
  onOpenParticipant(entry: RosterEntry, position: { x: number; y: number }): void;
  onOpenProfile?(identity: string, position: { x: number; y: number }): void;
  onWatch?(participantId: string, watching: boolean): void;
  onPreview?(participantId?: string): void;
  tags?: ReadonlyMap<string, WornTag>;
}) {
  if (entries.length === 0) return null;

  return (
    <div className="voice-roster mb-2 ml-5 flex flex-col gap-0.5 border-l border-border/70 pl-1.5">
      {entries.map((entry) => (
        <div className="roster-row flex min-w-0 items-center gap-1.5" key={entry.id} data-hover-scope>
          <button
            className={cn(
              'roster-entry flex min-h-7 min-w-0 flex-1 items-center gap-2 rounded-md px-1.5 py-1 text-left text-xs text-muted-foreground transition-colors',
              'hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              entry.isSpeaking && 'is-speaking text-foreground',
            )}
            type="button"
            aria-label={`View ${entry.name}'s profile`}
            onClick={(event) => onOpenProfile?.(entry.id, { x: event.clientX, y: event.clientY })}
            onContextMenu={(event) => {
              event.preventDefault();
              if (!entry.detailed || entry.isLocal) return;
              onOpenParticipant(entry, { x: event.clientX, y: event.clientY });
            }}
          >
            {/* The ring, not the colour of the name, is what carries across a
                glance: a row is small, and a name changing shade is not. */}
            <span
              className={cn(
                'roster-face grid size-5.5 shrink-0 place-items-center rounded-full transition-shadow duration-150',
                entry.isSpeaking && 'shadow-[0_0_0_1px_var(--sidebar),0_0_0_2.5px_var(--success)]',
              )}
            >
              <Avatar
                className="mini-avatar grid size-full place-items-center overflow-hidden rounded-full text-[8px] font-extrabold text-background"
                name={entry.name}
                initials={entry.initials}
                imageId={entry.avatarId}
                accent={entry.accent}
              />
            </span>
            <span className="roster-name min-w-0 flex-1 truncate">{entry.name}</span>
            {tags?.get(accountOf(entry.id)) && <TagChip tag={tags.get(accountOf(entry.id))!} size="xs" />}
            {entry.isMuted && (
              <MicOff aria-label={`${entry.name} is muted`} size={13} className="roster-flag shrink-0" />
            )}
            {entry.locallyMuted && (
              <VolumeX
                aria-label={`${entry.name} is silenced for you`}
                size={13}
                className="roster-flag shrink-0"
              />
            )}
            <SignalBars signal={entry.signal} />
          </button>
          {entry.isBroadcasting && <LiveBadge entry={entry} watching={watching} />}
        </div>
      ))}
    </div>
  );
}

/**
 * Says that somebody is sharing, and whether this machine took it. The picture
 * and the choice live on the person in the room; a list that also carried them
 * would be two places to look for the same thing.
 */
function LiveBadge({ entry, watching }: { entry: RosterEntry; watching?: string[] }) {
  // Your own screen is never something you are watching: it is something you
  // are sending, and the room should not tell you that you tuned into it.
  const taken = !entry.isLocal && watching?.includes(entry.id);
  const hint = entry.isLocal
    ? 'You are sharing your screen'
    : taken
      ? `You are watching ${entry.name}`
      : `${entry.name} is sharing a screen`;
  return (
    <Tooltip label={hint}>
      <span
        className={cn(
          'roster-live inline-flex shrink-0 items-center gap-1 rounded px-1 py-px text-[8.5px] font-bold uppercase tracking-[0.12em]',
          taken ? 'bg-secondary text-muted-foreground' : 'bg-destructive text-destructive-foreground',
        )}
        aria-label={hint}
      >
        {taken ? (
          <Tv aria-hidden="true" className="size-2.5" />
        ) : (
          <span className="size-1 rounded-full bg-current" />
        )}
        Live
      </span>
    </Tooltip>
  );
}
