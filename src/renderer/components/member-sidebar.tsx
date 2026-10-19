import { useId, useMemo, useState } from 'react';
import { AudioLines, Crown, Headphones, MicOff, MoreHorizontal, Shield, UserRound } from 'lucide-react';
import type { CommunityChannel, CommunityMember, Role } from '../../shared/community';
import type { CommunityClient } from '../infrastructure/community-client';
import { useChannelResources } from '../infrastructure/use-channel-resources';
import { ChannelResources } from './channel-resources';
import { groupMembers } from '../domain/members';
import { Avatar } from './avatar';
import { TagChip } from './profile-identity';
import { Tooltip } from './ui/tooltip';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from './ui/dropdown-menu';
import type { Participant } from '../domain/conference';
import { accountOf } from '../domain/roster';

type Position = { x: number; y: number };

/** Voice presence is real; absence from a call does not claim somebody is offline. */
export function MemberSidebar({
  members,
  roles,
  userId,
  voiceIds,
  participants = [],
  onOpenProfile,
  onOpenFullProfile,
  onAudioOptions,
  api,
  channel,
  resourcesRevision,
}: {
  members: readonly CommunityMember[];
  roles?: readonly Role[];
  userId: string;
  voiceIds: ReadonlySet<string>;
  participants?: readonly Participant[];
  onOpenProfile?(memberId: string, position: Position): void;
  onOpenFullProfile?(memberId: string): void;
  onAudioOptions?(participantId: string, position: Position): void;
  api?: CommunityClient;
  channel?: CommunityChannel;
  resourcesRevision?: number;
}) {
  const groups = useMemo(() => groupMembers(members, voiceIds, roles), [members, voiceIds, roles]);
  const [tab, setTab] = useState<'members' | 'media' | 'links'>('members');
  const id = useId();
  const tabs = ['members', 'media', 'links'] as const;
  const media = useChannelResources(api, channel, 'media', resourcesRevision, tab !== 'links');
  const links = useChannelResources(api, channel, 'links', resourcesRevision, tab === 'links');
  const profilePosition = (element: HTMLElement): Position => ({
    x:
      (element.closest('.member-sidebar')?.getBoundingClientRect().left ??
        element.getBoundingClientRect().left) + 12,
    y: element.getBoundingClientRect().top,
  });
  return (
    <aside
      className="member-sidebar"
      aria-label={tab === 'members' ? 'Members' : tab === 'media' ? 'Media' : 'Links'}
    >
      {api ? (
        <header className="member-heading sidebar-tab-heading" role="tablist" aria-label="Room details">
          {tabs.map((name) => (
            <button
              type="button"
              role="tab"
              key={name}
              id={`${id}-${name}-tab`}
              aria-controls={`${id}-${name}-panel`}
              aria-selected={tab === name}
              tabIndex={tab === name ? 0 : -1}
              onClick={() => setTab(name)}
              onKeyDown={(event) => {
                const current = tabs.indexOf(name);
                const next =
                  event.key === 'ArrowRight'
                    ? (current + 1) % 3
                    : event.key === 'ArrowLeft'
                      ? (current + 2) % 3
                      : event.key === 'Home'
                        ? 0
                        : event.key === 'End'
                          ? 2
                          : undefined;
                if (next === undefined) return;
                event.preventDefault();
                setTab(tabs[next]);
                document.getElementById(`${id}-${tabs[next]}-tab`)?.focus();
              }}
            >
              {name === 'members' ? (
                <>
                  Members <span>{members.length}</span>
                </>
              ) : name === 'media' ? (
                'Media'
              ) : (
                'Links'
              )}
            </button>
          ))}
        </header>
      ) : (
        <header className="member-heading">
          Members <span>{members.length}</span>
        </header>
      )}
      <div
        className={`sidebar-tab-panel ${tab === 'members' ? 'sidebar-members-panel' : ''}`}
        role="tabpanel"
        id={`${id}-${tab}-panel`}
        aria-labelledby={api ? `${id}-${tab}-tab` : undefined}
        tabIndex={0}
      >
        {tab === 'members' ? (
          <>
            {groups.map((group) => (
              <section className="sidebar-member-group" key={group.key} data-group={group.key}>
                <h2>
                  {group.label} — {group.members.length}
                </h2>
                {group.members.map((member) => {
                  const inVoice = voiceIds.has(member.id);
                  const participant = participants.find((person) => accountOf(person.id) === member.id);
                  const muted = inVoice && (participant?.isMuted || member.muted);
                  const speaking = inVoice && participant?.isSpeaking && !muted;
                  const status = muted
                    ? 'Muted'
                    : speaking
                      ? 'Speaking'
                      : participant
                        ? 'Listening'
                        : inVoice
                          ? 'In voice'
                          : `@${member.username}`;
                  return (
                    <div
                      className="member-entry"
                      key={member.id}
                      data-hover-scope
                      data-speaking={speaking || undefined}
                    >
                      <button
                        className="member-identity"
                        type="button"
                        aria-label={`View ${member.displayName}'s profile`}
                        title={`${member.displayName} (@${member.username})`}
                        onClick={(event) => onOpenProfile?.(member.id, profilePosition(event.currentTarget))}
                      >
                        <span className="member-avatar-wrap">
                          <Avatar
                            className="sidebar-member-avatar"
                            name={member.displayName}
                            imageId={member.avatarId}
                          />
                          {inVoice && (
                            <span
                              className={`member-presence ${muted ? 'is-muted' : ''}`}
                              aria-label="In a voice channel"
                            />
                          )}
                        </span>
                        <span className="member-identity-copy">
                          <span className="member-name-line">
                            <span className="member-name">
                              {member.displayName}
                              {member.id === userId && <span className="member-you"> (you)</span>}
                            </span>
                            {member.role !== 'member' && (
                              <Tooltip label={member.role === 'owner' ? 'Owner' : 'Administrator'}>
                                <span className="member-standing">
                                  {member.role === 'owner' ? (
                                    <Crown size={13} aria-hidden="true" />
                                  ) : (
                                    <Shield size={13} aria-hidden="true" />
                                  )}
                                </span>
                              </Tooltip>
                            )}
                            {member.tag && <TagChip tag={member.tag} size="xs" />}
                          </span>
                          <span className="member-activity" title={status}>
                            {status}
                          </span>
                        </span>
                      </button>
                      <span className="member-row-state">
                        {muted ? (
                          <MicOff size={16} aria-label="Muted" />
                        ) : speaking ? (
                          <AudioLines size={18} aria-label="Speaking" />
                        ) : null}
                      </span>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button
                            type="button"
                            className="member-more"
                            aria-label={`Options for ${member.displayName}`}
                          >
                            <MoreHorizontal size={18} aria-hidden="true" />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" side="left" className="sidebar-member-menu">
                          <DropdownMenuItem
                            onSelect={(event) => {
                              const trigger = document.getElementById(`${id}-${member.id}-anchor`);
                              onOpenProfile?.(
                                member.id,
                                trigger ? profilePosition(trigger) : { x: window.innerWidth - 330, y: 140 },
                              );
                            }}
                          >
                            <UserRound size={15} />
                            View profile
                          </DropdownMenuItem>
                          {onOpenFullProfile && (
                            <DropdownMenuItem onSelect={() => onOpenFullProfile(member.id)}>
                              <UserRound size={15} />
                              Open full profile
                            </DropdownMenuItem>
                          )}
                          {participant && !participant.isLocal && onAudioOptions && (
                            <DropdownMenuItem
                              onSelect={() => {
                                const anchor = document.getElementById(`${id}-${member.id}-anchor`);
                                onAudioOptions(
                                  participant.id,
                                  anchor ? profilePosition(anchor) : { x: window.innerWidth - 330, y: 140 },
                                );
                              }}
                            >
                              <Headphones size={15} />
                              Audio options
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                      <span
                        id={`${id}-${member.id}-anchor`}
                        className="member-menu-anchor"
                        aria-hidden="true"
                      />
                    </div>
                  );
                })}
              </section>
            ))}
            {api && channel && (
              <ChannelResources
                api={api}
                channel={channel}
                kind="media"
                collection={media}
                compact
                onSeeAll={() => {
                  setTab('media');
                  document.getElementById(`${id}-media-tab`)?.focus();
                }}
              />
            )}
          </>
        ) : api && channel ? (
          <ChannelResources
            api={api}
            channel={channel}
            kind={tab}
            collection={tab === 'media' ? media : links}
          />
        ) : (
          <div className="resources-empty">
            <strong>Choose a text channel</strong>
            <p>Shared media and links will appear here.</p>
          </div>
        )}
      </div>
    </aside>
  );
}
