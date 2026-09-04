import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { CommunityMember } from '../../src/shared/community';
import { groupMembers } from '../../src/renderer/domain/members';
import { MemberSidebar } from '../../src/renderer/components/member-sidebar';
import { TooltipProvider } from '../../src/renderer/components/ui/tooltip';

afterEach(cleanup);

const member = (id: string, displayName: string, role: CommunityMember['role']): CommunityMember => ({
  id,
  username: displayName.toLowerCase(),
  displayName,
  role,
});

const people = [
  member('3', 'castiel', 'member'),
  member('1', 'merge', 'owner'),
  member('2', 'Allan', 'admin'),
  member('4', 'babi', 'member'),
];

describe('groupMembers', () => {
  it('reads the people in a call first, then the rest by what they may do', () => {
    const groups = groupMembers(people, new Set(['4']));
    expect(groups.map((group) => [group.label, group.members.map((one) => one.displayName)])).toEqual([
      ['In voice', ['babi']],
      ['Owner', ['merge']],
      ['Administrators', ['Allan']],
      ['Members', ['castiel']],
    ]);
  });

  it('leaves out a group nobody is in', () => {
    const groups = groupMembers([member('1', 'merge', 'owner')], new Set());
    expect(groups.map((group) => group.label)).toEqual(['Owner']);
  });

  it('sorts names the way they are read, not by their case', () => {
    const names = groupMembers(people, new Set())
      .flatMap((group) => group.members)
      .map((one) => one.displayName);
    expect(names).toEqual(['merge', 'Allan', 'babi', 'castiel']);
  });
});

describe('MemberSidebar', () => {
  it('names every member once and marks the one reading it', () => {
    render(
      <TooltipProvider>
        <MemberSidebar members={people} userId="1" voiceIds={new Set(['4'])} />
      </TooltipProvider>,
    );
    const list = screen.getByRole('complementary', { name: 'Members' });
    expect(within(list).getByText('In voice — 1')).toBeInTheDocument();
    expect(within(list).getByText('Members — 1')).toBeInTheDocument();
    expect(within(list).getByText('babi')).toBeInTheDocument();
    expect(within(list).getByText('(you)')).toBeInTheDocument();
    expect(within(list).getAllByTitle('In a voice channel')).toHaveLength(1);
  });
});
