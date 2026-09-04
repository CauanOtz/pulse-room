import type { CommunityMember, MemberRole } from '../../shared/community';

export interface MemberGroup {
  key: string;
  label: string;
  members: CommunityMember[];
}

const order: { key: MemberRole; label: string }[] = [
  { key: 'owner', label: 'Owner' },
  { key: 'admin', label: 'Administrators' },
  { key: 'member', label: 'Members' },
];

/**
 * The members of a server, arranged the way they are read down a sidebar: the
 * people you can talk to this moment first, then everybody else by what they
 * are allowed to do.
 *
 * The service reports who is sitting in a voice channel and nothing more, so no
 * group here claims to know who is awake.
 */
export function groupMembers(
  members: readonly CommunityMember[],
  voiceIds: ReadonlySet<string>,
): MemberGroup[] {
  const sorted = [...members].sort((a, b) =>
    a.displayName.localeCompare(b.displayName, undefined, { sensitivity: 'base' }),
  );
  const inVoice = sorted.filter((member) => voiceIds.has(member.id));
  const rest = sorted.filter((member) => !voiceIds.has(member.id));
  return [
    { key: 'voice', label: 'In voice', members: inVoice },
    ...order.map(({ key, label }) => ({
      key,
      label,
      members: rest.filter((member) => member.role === key),
    })),
  ].filter((group) => group.members.length > 0);
}
