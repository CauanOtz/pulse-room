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
      className="member-sidebar flex w-56 flex-none flex-col gap-4 overflow-y-auto rounded-lg border border-border bg-card/40 px-2 py-3"
      aria-label="Members"
    >
      {groups.map((group) => (
        <section className="flex flex-col gap-0.5" key={group.key}>
          <h2 className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            {group.label} — {group.members.length}
          </h2>
          {group.members.map((member) => {
            const speaking = voiceIds.has(member.id);
            return (
              <div
                className="member-entry flex items-center gap-2.5 rounded-lg px-2 py-1.5 transition-colors hover:bg-accent/60"
                key={member.id}
              >
                <span className="relative shrink-0">
                  <Avatar
                    className="grid size-8 place-items-center rounded-full bg-secondary text-[10px] font-bold text-secondary-foreground"
                    name={member.displayName}
                    imageId={member.avatarId}
                  />
                  {speaking && (
                    <span
                      className="absolute -bottom-0.5 -right-0.5 grid size-3.5 place-items-center rounded-full border-2 border-background bg-primary text-primary-foreground"
                      title="In a voice channel"
                    >
                      <Mic aria-hidden="true" className="size-2" strokeWidth={3} />
                    </span>
                  )}
                </span>
                <span
                  className="min-w-0 flex-1 truncate text-[13px] font-medium text-foreground"
                  title={`@${member.username}`}
                >
                  {member.displayName}
                  {member.id === userId && <span className="text-muted-foreground"> (you)</span>}
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
