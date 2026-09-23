import { useMemo } from 'react';
import { Crown, Mic, Shield } from 'lucide-react';
import type { CommunityMember } from '../../shared/community';
import { groupMembers } from '../domain/members';
import { Avatar } from './avatar';
import { Tooltip } from './ui/tooltip';

/**
 * Who else is in this server, beside the conversation. Voice is the only
 * presence the service knows, so the list says who is in a call and leaves the
 * rest unclaimed rather than inventing an online light.
 */
export function MemberSidebar({
  members,
  userId,
  voiceIds,
}: {
  members: readonly CommunityMember[];
  userId: string;
  voiceIds: ReadonlySet<string>;
}) {
  const groups = useMemo(() => groupMembers(members, voiceIds), [members, voiceIds]);
  return (
    <aside
      className="member-sidebar flex w-58 flex-none flex-col gap-4 overflow-y-auto border-l border-border px-2 py-3"
      aria-label="Members"
    >
      {groups.map((group) => (
        <section className="flex flex-col gap-0.5" key={group.key}>
          <h2 className="px-2 pb-1 text-[11px] font-semibold text-muted-foreground">
            {group.label} — {group.members.length}
          </h2>
          {group.members.map((member) => {
            const speaking = voiceIds.has(member.id);
            return (
              <div
                className="member-entry flex min-h-9 items-center gap-2.5 rounded-md px-2 py-1 transition-colors hover:bg-accent/70"
                key={member.id}
              >
                <span className="relative shrink-0">
                  <Avatar
                    className="grid size-7.5 place-items-center rounded-full bg-secondary text-[10px] font-bold text-secondary-foreground"
                    name={member.displayName}
                    imageId={member.avatarId}
                  />
                  {speaking && (
                    <Tooltip label="In a voice channel">
                      <span
                        className="absolute -bottom-0.5 -right-0.5 grid size-3.5 place-items-center rounded-full border-2 border-sidebar bg-success text-background"
                        aria-label="In a voice channel"
                      >
                        <Mic aria-hidden="true" className="size-2" strokeWidth={3} />
                      </span>
                    </Tooltip>
                  )}
                </span>
                <span className="flex min-w-0 flex-1 flex-col leading-tight">
                  <span className="truncate text-[13px] font-medium text-foreground">
                    {member.displayName}
                    {member.id === userId && <span className="text-muted-foreground"> (you)</span>}
                  </span>
                  {/* The handle is what you type to find somebody, so the list
                      carries it rather than hiding it behind a pointer. */}
                  <span className="truncate text-[11px] text-muted-foreground">@{member.username}</span>
                </span>
                {member.role !== 'member' && (
                  <Tooltip label={member.role === 'owner' ? 'Owner' : 'Administrator'}>
                    <span className="shrink-0 text-muted-foreground">
                      {member.role === 'owner' ? (
                        <Crown aria-hidden="true" className="size-3.5" />
                      ) : (
                        <Shield aria-hidden="true" className="size-3.5" />
                      )}
                    </span>
                  </Tooltip>
                )}
              </div>
            );
          })}
        </section>
      ))}
    </aside>
  );
}
