import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CommunityDetail, CommunityMember, Role } from '../../src/shared/community';
import { allPermissions, everyoneDefault, Permission } from '../../src/shared/permissions';
import { ProfileModal } from '../../src/renderer/components/profile-modal';
import { MemberActionsSection } from '../../src/renderer/components/member-actions';
import { TooltipProvider } from '../../src/renderer/components/ui/tooltip';
import type { CommunityClient } from '../../src/renderer/infrastructure/community-client';

afterEach(cleanup);

const roles: Role[] = [
  { id: 'mod', name: 'Moderator', colour: '#6a5acd', position: 1, permissions: Permission.MoveMembers, isDefault: false, hoist: false },
  { id: 'everyone', name: '@everyone', colour: null, position: 0, permissions: everyoneDefault, isDefault: true, hoist: false },
];
const person = (id: string, name: string, extra: Partial<CommunityMember> = {}): CommunityMember => ({
  id,
  username: name.toLowerCase(),
  displayName: name,
  role: 'member',
  roleIds: [],
  ...extra,
});
const owner = person('owner', 'Owner', { role: 'owner' });
const pat = person('pat', 'Pat', {
  bio: 'Night owl.',
  roleIds: ['mod'],
  theme: { primary: '#112233', accent: '#445566' },
  createdAt: '2025-03-04T12:00:00Z',
  joinedAt: '2026-01-02T12:00:00Z',
});
const detail = (permissions = allPermissions, role: CommunityMember['role'] = 'owner'): CommunityDetail => ({
  server: { id: 's', name: 'Pulse', role, permissions },
  channels: [
    { id: 'v1', serverId: 's', name: 'Lounge', type: 'voice', private: false, memberIds: [], allowSpeak: true, allowShare: true, readOnly: false },
    { id: 'v2', serverId: 's', name: 'Games', type: 'voice', private: false, memberIds: [], allowSpeak: true, allowShare: true, readOnly: false },
  ],
  members: [owner, pat],
  roles,
});
const client = () => ({ request: vi.fn(async () => ({})) }) as unknown as CommunityClient;

describe('ProfileModal', () => {
  const open = (member: CommunityMember, options: Partial<Parameters<typeof ProfileModal>[0]> = {}) =>
    render(
      <TooltipProvider>
        <ProfileModal
          api={client()}
          detail={detail()}
          userId="owner"
          member={member}
          onChanged={async () => undefined}
          onClose={() => undefined}
          {...options}
        />
      </TooltipProvider>,
    );

  it('shows the whole person in their own colours: banner, bio, roles and both dates', () => {
    open(pat, { seat: { channelId: 'v1', channelName: 'Lounge' } });
    const dialog = screen.getByRole('dialog', { name: "Pat's profile" });
    expect(dialog).toHaveAttribute('data-themed', 'true');
    expect(dialog.querySelector('.profile-banner')).toHaveAttribute('data-banner', 'theme');
    expect(within(dialog).getByText('Night owl.')).toBeInTheDocument();
    expect(within(dialog).getByRole('list', { name: 'Roles' })).toHaveTextContent('Moderator');
    expect(within(dialog).getByText('In Lounge')).toBeInTheDocument();
    expect(within(dialog).getByText(/2025/)).toBeInTheDocument();
    expect(within(dialog).getByText(/2026/)).toBeInTheDocument();
  });

  it('says so, rather than inventing a date, for somebody who joined before it was kept', () => {
    open({ ...pat, joinedAt: null });
    expect(screen.getByText('Before it was kept')).toBeInTheDocument();
  });

  it('offers what can be done to somebody below you, and nothing on your own', () => {
    open(pat, { seat: { channelId: 'v1', channelName: 'Lounge' }, seatOf: () => ({ channelId: 'v1', channelName: 'Lounge' }) });
    const manage = screen.getByRole('region', { name: 'Manage' });
    for (const label of ['Move to…', 'Disconnect from voice', 'Kick', 'Ban', 'Timeout…'])
      expect(within(manage).getByRole('button', { name: label })).toBeInTheDocument();
    cleanup();
    const onEditProfile = vi.fn();
    open(owner, { onEditProfile });
    expect(screen.queryByRole('region', { name: 'Manage' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Edit profile/ }));
    expect(onEditProfile).toHaveBeenCalled();
  });

  it('sets their volume for you when they share your call', () => {
    const onVolume = vi.fn();
    const onMuted = vi.fn();
    open(pat, { audio: { volume: 80, locallyMuted: false, onVolume, onMuted } });
    fireEvent.change(screen.getByLabelText('Pat volume'), { target: { value: '120' } });
    expect(onVolume).toHaveBeenCalledWith(120);
    fireEvent.click(screen.getByRole('button', { name: 'Mute for me' }));
    expect(onMuted).toHaveBeenCalledWith(true);
  });
});

describe('moving somebody', () => {
  const seatOf = (id: string) => (id === 'pat' ? { channelId: 'v1', channelName: 'Lounge' } : undefined);

  it('asks where, then sends them there', async () => {
    const api = client();
    render(
      <MemberActionsSection api={api} detail={detail()} userId="owner" member={pat} seatOf={seatOf} onChanged={async () => undefined} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Move to…' }));
    const dialog = screen.getByRole('dialog', { name: 'Move Pat' });
    // Where they already are is shown, and cannot be chosen.
    expect(within(dialog).getByLabelText(/Lounge/)).toBeDisabled();
    fireEvent.click(within(dialog).getByLabelText(/Games/));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Move' }));
    await waitFor(() =>
      expect(api.request).toHaveBeenCalledWith('/api/servers/s/members/pat/move', 'POST', { channelId: 'v2' }),
    );
  });

  it('is only offered for somebody in a call, to somebody with Move members', () => {
    render(
      <MemberActionsSection api={client()} detail={detail()} userId="owner" member={pat} seatOf={() => undefined} onChanged={async () => undefined} />,
    );
    expect(screen.queryByRole('button', { name: 'Move to…' })).toBeNull();
    cleanup();
    // Above Pat, allowed to kick, not to move.
    const boss: Role = { id: 'boss', name: 'Boss', colour: null, position: 2, permissions: Permission.KickMembers, isDefault: false, hoist: false };
    const kim = person('kim', 'Kim', { roleIds: ['boss'] });
    const withKim: CommunityDetail = {
      ...detail(everyoneDefault | Permission.KickMembers, 'member'),
      members: [owner, pat, kim],
      roles: [boss, ...roles],
    };
    render(
      <MemberActionsSection api={client()} detail={withKim} userId="kim" member={pat} seatOf={seatOf} onChanged={async () => undefined} />,
    );
    expect(screen.getByRole('button', { name: 'Kick' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Move to…' })).toBeNull();
  });
});
