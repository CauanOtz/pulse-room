import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CommunityDetail } from '../../src/shared/community';
import { MemberManager } from '../../src/renderer/components/member-manager';
import { TooltipProvider } from '../../src/renderer/components/ui/tooltip';
import type { CommunityClient } from '../../src/renderer/infrastructure/community-client';

afterEach(cleanup);

const detail: CommunityDetail = {
  server: { id: 'server', name: 'Friends', role: 'owner' },
  channels: [],
  members: [
    { id: 'owner', username: 'owner', displayName: 'Owner', role: 'owner' },
    { id: 'friend', username: 'morgan_dev', displayName: 'Morgan', role: 'member', muted: true },
    {
      id: 'guest',
      username: 'guest',
      displayName: 'Guest',
      role: 'member',
      timeoutUntil: '2000-01-01T00:00:00Z',
    },
  ],
};

function directory() {
  const request = vi.fn();
  render(
    <TooltipProvider>
      <MemberManager
        api={{ request } as unknown as CommunityClient}
        detail={detail}
        userId="owner"
        onChanged={vi.fn()}
      />
    </TooltipProvider>,
  );
  return request;
}

describe('member directory', () => {
  it('finds a member by username, combines the search with a filter and recovers from no results', () => {
    const request = directory();
    fireEvent.change(screen.getByRole('textbox', { name: 'Search members' }), {
      target: { value: ' MORGAN_DEV ' },
    });
    expect(screen.getByRole('button', { name: "Open Morgan's full profile" })).toBeVisible();
    expect(screen.queryByRole('button', { name: "Open Guest's full profile" })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Team 1' }));
    expect(screen.getByText('No members found')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Show all members' }));
    expect(screen.getByRole('textbox', { name: 'Search members' })).toHaveValue('');
    expect(screen.getByRole('button', { name: "Open Guest's full profile" })).toBeVisible();
    expect(request).not.toHaveBeenCalled();
  });

  it('shows current restrictions without counting an expired timeout', () => {
    directory();
    fireEvent.click(screen.getByRole('button', { name: 'Restricted 1' }));
    expect(screen.getByText('Server muted')).toBeVisible();
    expect(screen.queryByRole('button', { name: "Open Guest's full profile" })).toBeNull();
    expect(screen.queryByRole('button', { name: "Open Owner's full profile" })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'All members 3' }));
    expect(screen.getByRole('button', { name: "Open Guest's full profile" })).toBeVisible();
  });
});
