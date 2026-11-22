import type { CommunityMember, MemberRole, Role } from '../../shared/community';

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
 * people you can talk to this moment first, then the owner, then everybody
 * under the highest role of theirs that is displayed separately, then the rest.
 *
 * A service from before roles sends none, and the fixed standings group them.
 *
 * People the service reports as away come last, under Offline, whatever their
 * role. A service that does not say who is here leaves everybody where their
 * role puts them, rather than calling them away.
 */
export function groupMembers(
  members: readonly CommunityMember[],
  voiceIds: ReadonlySet<string>,
  roles?: readonly Role[],
): MemberGroup[] {
  const sorted = [...members].sort((a, b) =>
    a.displayName.localeCompare(b.displayName, undefined, { sensitivity: 'base' }),
  );
  const inVoice = sorted.filter((member) => voiceIds.has(member.id));
  const away = sorted.filter((member) => !voiceIds.has(member.id) && member.online === false);
  const rest = sorted.filter((member) => !voiceIds.has(member.id) && member.online !== false);
  const voice = { key: 'voice', label: 'In voice', members: inVoice };
  const offline = { key: 'offline', label: 'Offline', members: away };
  if (!roles)
    return [
      voice,
      ...order.map(({ key, label }) => ({
        key,
        label,
        members: rest.filter((member) => member.role === key),
      })),
      offline,
    ].filter((group) => group.members.length > 0);

  const hoisted = roles.filter((role) => role.hoist && !role.isDefault).sort((a, b) => b.position - a.position);
  const shownUnder = (member: CommunityMember) => hoisted.find((role) => member.roleIds?.includes(role.id));
  const owners = rest.filter((member) => member.role === 'owner');
  const others = rest.filter((member) => member.role !== 'owner');
  return [
    voice,
    { key: 'owner', label: 'Owner', members: owners },
    ...hoisted.map((role) => ({
      key: `role:${role.id}`,
      label: role.name,
      members: others.filter((member) => shownUnder(member)?.id === role.id),
    })),
    { key: 'member', label: 'Members', members: others.filter((member) => !shownUnder(member)) },
    offline,
  ].filter((group) => group.members.length > 0);
}
