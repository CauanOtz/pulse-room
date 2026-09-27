import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CommunityDetail, CommunityMember, Role } from '../../src/shared/community';
import { allPermissions, everyoneDefault, Permission, type PermissionOverride } from '../../src/shared/permissions';
import { myAccess, outranks } from '../../src/renderer/domain/access';
import { groupMembers } from '../../src/renderer/domain/members';
import { PermissionOverridesEditor } from '../../src/renderer/components/permission-overrides';
import { RoleEditor } from '../../src/renderer/components/role-editor';
import { ChannelSidebar } from '../../src/renderer/components/channel-sidebar';
import { TooltipProvider } from '../../src/renderer/components/ui/tooltip';
import type { CommunityClient } from '../../src/renderer/infrastructure/community-client';

afterEach(cleanup);

const roles: Role[] = [
  { id: 'admin', name: 'Admin', colour: '#e0452b', position: 3, permissions: Permission.Administrator, isDefault: false, hoist: true },
  {
    id: 'mod',
    name: 'Moderator',
    colour: '#6a5acd',
    position: 2,
    permissions: Permission.ManageRoles | Permission.ManageChannels | Permission.KickMembers,
    isDefault: false,
    hoist: true,
  },
  { id: 'vip', name: 'VIP', colour: null, position: 1, permissions: 0, isDefault: false, hoist: false },
  { id: 'everyone', name: '@everyone', colour: null, position: 0, permissions: everyoneDefault, isDefault: true, hoist: false },
];
const member = (id: string, name: string, roleIds: string[], role: CommunityMember['role'] = 'member'): CommunityMember => ({
  id,
  username: name.toLowerCase(),
  displayName: name,
  role,
  roleIds,
});
const members = [
  member('owner', 'Owner', [], 'owner'),
  member('ada', 'Ada', ['admin'], 'admin'),
  member('mo', 'Mo', ['mod', 'vip']),
  member('vi', 'Vi', ['vip']),
  member('pat', 'Pat', []),
];
const detailFor = (permissions: number, role: CommunityMember['role'] = 'member'): CommunityDetail => ({
  server: { id: 's', name: 'Pulse', role, permissions },
  channels: [],
  members,
  roles,
});
const modDetail = detailFor(everyoneDefault | roles[1].permissions);

describe('where you stand', () => {
  it('ranks you by your highest role and lets you act only below it', () => {
    const access = myAccess(modDetail, 'mo');
    expect(access.rank).toBe(2);
    expect(outranks(access, modDetail, members[3], 'mo')).toBe(true);
    expect(outranks(access, modDetail, members[1], 'mo')).toBe(false);
    expect(outranks(access, modDetail, members[0], 'mo')).toBe(false);
    expect(outranks(access, modDetail, members[2], 'mo')).toBe(false);
  });

  it('falls back to the fixed standing when a service sends no permissions', () => {
    const old: CommunityDetail = { server: { id: 's', name: 'Old', role: 'admin' }, channels: [], members: [] };
    expect(myAccess(old, 'x').permissions).toBe(allPermissions);
  });
});

describe('member groups', () => {
  it('lists people under the highest role displayed separately, and the rest as members', () => {
    const groups = groupMembers(members, new Set(['vi']), roles);
    expect(groups.map((group) => [group.label, group.members.map((one) => one.displayName)])).toEqual([
      ['In voice', ['Vi']],
      ['Owner', ['Owner']],
      ['Admin', ['Ada']],
      ['Moderator', ['Mo']],
      ['Members', ['Pat']],
    ]);
  });
});

describe('PermissionOverridesEditor', () => {
  const edit = (
    overrides: PermissionOverride[],
    options: { detail?: CommunityDetail; userId?: string; actor?: number } = {},
  ) => {
    const onChange = vi.fn();
    const detail = options.detail ?? modDetail;
    const userId = options.userId ?? 'mo';
    render(
      <TooltipProvider>
        <PermissionOverridesEditor
          detail={detail}
          userId={userId}
          access={myAccess(detail, userId)}
          actorPermissions={options.actor ?? detail.server.permissions!}
          scope="text"
          overrides={overrides}
          onChange={onChange}
        />
      </TooltipProvider>,
    );
    return onChange;
  };
  const row = (label: string) => screen.getByRole('radiogroup', { name: label });

  it('always lists @everyone, and starts every permission at inherit', () => {
    edit([]);
    expect(screen.getByRole('option', { name: /@everyone/ })).toHaveAttribute('aria-selected', 'true');
    expect(within(row('View channels')).getByRole('radio', { name: 'Inherit' })).toHaveAttribute('aria-checked', 'true');
  });

  it('writes a deny and an allow as bits, and inherit as neither', () => {
    const onChange = edit([]);
    fireEvent.click(within(row('View channels')).getByRole('radio', { name: 'Deny' }));
    expect(onChange).toHaveBeenLastCalledWith([
      { targetType: 'role', targetId: 'everyone', allow: 0, deny: Permission.ViewChannels },
    ]);
    cleanup();
    const again = edit([{ targetType: 'role', targetId: 'everyone', allow: 0, deny: Permission.ViewChannels }]);
    fireEvent.click(within(row('View channels')).getByRole('radio', { name: 'Allow' }));
    expect(again).toHaveBeenLastCalledWith([
      { targetType: 'role', targetId: 'everyone', allow: Permission.ViewChannels, deny: 0 },
    ]);
    cleanup();
    const back = edit([{ targetType: 'role', targetId: 'everyone', allow: Permission.ViewChannels, deny: 0 }]);
    fireEvent.click(within(row('View channels')).getByRole('radio', { name: 'Inherit' }));
    expect(back).toHaveBeenLastCalledWith([{ targetType: 'role', targetId: 'everyone', allow: 0, deny: 0 }]);
  });

  it('shows only the permissions that mean something in a text channel', () => {
    edit([]);
    expect(screen.getByRole('radiogroup', { name: 'Send messages' })).toBeInTheDocument();
    expect(screen.queryByRole('radiogroup', { name: 'Speak' })).toBeNull();
    expect(screen.queryByRole('radiogroup', { name: 'Kick members' })).toBeNull();
  });

  it('locks a role above the editor, and a permission they do not hold', () => {
    edit([{ targetType: 'role', targetId: 'admin', allow: 0, deny: Permission.SendMessages }], {
      actor: everyoneDefault & ~Permission.SendMessages,
    });
    // Send messages is not the moderator's to give here.
    expect(within(row('Send messages')).getByRole('radio', { name: 'Deny' })).toBeDisabled();
    expect(within(row('View channels')).getByRole('radio', { name: 'Deny' })).toBeEnabled();
    fireEvent.click(screen.getByRole('option', { name: /Admin/ }));
    expect(within(row('View channels')).getByRole('radio', { name: 'Deny' })).toBeDisabled();
    expect(screen.getByText(/stands at or above you/)).toBeInTheDocument();
  });

  it('lets an administrator change anything', () => {
    const detail = detailFor(allPermissions);
    edit([{ targetType: 'role', targetId: 'admin', allow: 0, deny: 0 }], { detail, userId: 'ada', actor: allPermissions });
    fireEvent.click(screen.getByRole('option', { name: /Admin/ }));
    expect(within(row('View channels')).getByRole('radio', { name: 'Deny' })).toBeEnabled();
  });

  it('takes a role or person off the list, back to inherit for everything', () => {
    const onChange = edit([{ targetType: 'role', targetId: 'vip', allow: Permission.ViewChannels, deny: 0 }]);
    fireEvent.click(screen.getByRole('option', { name: /VIP/ }));
    fireEvent.click(screen.getByRole('button', { name: /Remove/ }));
    expect(onChange).toHaveBeenLastCalledWith([]);
  });
});

describe('RoleEditor', () => {
  const api = () => ({ request: vi.fn(async () => ({ id: 'new' })) }) as unknown as CommunityClient;

  it('shows roles highest first, with the ones above the editor locked', () => {
    render(
      <TooltipProvider>
        <RoleEditor api={api()} detail={modDetail} userId="mo" onChanged={async () => undefined} />
      </TooltipProvider>,
    );
    const list = screen.getByRole('list', { name: 'Roles, highest first' });
    expect(within(list).getAllByRole('listitem').map((item) => item.textContent?.replace(/\d+$/, ''))).toEqual([
      'Admin',
      'Moderator',
      'VIP',
      '@everyone',
    ]);
    expect(within(list).getAllByLabelText('Above your highest role')).toHaveLength(2);
    expect(screen.getByText(/at or above your highest role/)).toBeInTheDocument();
  });

  it('only lets a permission be granted by somebody who holds it', () => {
    render(
      <TooltipProvider>
        <RoleEditor api={api()} detail={modDetail} userId="mo" onChanged={async () => undefined} />
      </TooltipProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: /^VIP/ }));
    fireEvent.click(screen.getByRole('tab', { name: 'Permissions' }));
    expect(screen.getByLabelText('Kick members')).toBeEnabled();
    expect(screen.getByLabelText('Ban members')).toBeDisabled();
    expect(screen.getByLabelText('Administrator')).toBeDisabled();
  });

  it('saves a role’s name and permissions together, and nothing until asked', async () => {
    const client = api();
    render(
      <TooltipProvider>
        <RoleEditor api={client} detail={modDetail} userId="mo" onChanged={async () => undefined} />
      </TooltipProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: /^VIP/ }));
    fireEvent.change(screen.getByLabelText('Role name'), { target: { value: 'Regulars' } });
    fireEvent.click(screen.getByRole('tab', { name: 'Permissions' }));
    fireEvent.click(screen.getByLabelText('Kick members'));
    expect(client.request).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Save role' }));
    await waitFor(() =>
      expect(client.request).toHaveBeenCalledWith('/api/servers/s/roles/vip', 'PATCH', {
        name: 'Regulars',
        colour: null,
        permissions: Permission.KickMembers,
        hoist: false,
      }),
    );
  });

  it('makes a role in a dialog, then opens what it may do', async () => {
    const client = api();
    const onChanged = vi.fn(async () => undefined);
    render(
      <TooltipProvider>
        <RoleEditor api={client} detail={modDetail} userId="mo" onChanged={onChanged} />
      </TooltipProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: /Create role/ }));
    const dialog = screen.getByRole('dialog', { name: 'Create role' });
    // Nothing is made until it has a name, and nothing at all until asked.
    expect(within(dialog).getByRole('button', { name: 'Create role' })).toBeDisabled();
    expect(client.request).not.toHaveBeenCalled();
    fireEvent.change(within(dialog).getByLabelText('Role name'), { target: { value: '  Helpers ' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Role colour: #45cf8a' }));
    fireEvent.click(within(dialog).getByLabelText('Display separately'));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create role' }));
    await waitFor(() =>
      expect(client.request).toHaveBeenCalledWith('/api/servers/s/roles', 'POST', {
        name: 'Helpers',
        colour: '#45cf8a',
        permissions: 0,
        hoist: true,
      }),
    );
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Create role' })).toBeNull());
    expect(onChanged).toHaveBeenCalled();
  });

  it('moves a role with the arrows, never above the editor', async () => {
    const client = api();
    const detail = detailFor(allPermissions, 'owner');
    render(
      <TooltipProvider>
        <RoleEditor api={client} detail={detail} userId="owner" onChanged={async () => undefined} />
      </TooltipProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Move VIP up' }));
    await waitFor(() =>
      expect(client.request).toHaveBeenCalledWith('/api/servers/s/roles', 'PUT', { roleIds: ['admin', 'vip', 'mod'] }),
    );
    cleanup();
    render(
      <TooltipProvider>
        <RoleEditor api={api()} detail={modDetail} userId="mo" onChanged={async () => undefined} />
      </TooltipProvider>,
    );
    // VIP is the moderator's to move, but not above their own role.
    expect(screen.getByRole('button', { name: 'Move VIP up' })).toBeDisabled();
  });
});

describe('ChannelSidebar with categories', () => {
  const render_ = (extra: Partial<Parameters<typeof ChannelSidebar>[0]> = {}) =>
    render(
      <TooltipProvider>
        <ChannelSidebar
          connectionState="disconnected"
          serverName="Pulse"
          channels={[
            { id: 'v1', name: 'Lounge' },
            { id: 'v2', name: 'Staff call', categoryId: 'c1' },
          ]}
          textChannels={[
            { id: 't1', serverId: 's', name: 'general', type: 'text', private: false, memberIds: [], allowSpeak: true, allowShare: true, readOnly: false },
            { id: 't2', serverId: 's', name: 'logs', type: 'text', categoryId: 'c1', private: true, memberIds: [], allowSpeak: true, allowShare: true, readOnly: false },
          ]}
          categories={[{ id: 'c1', name: 'STAFF' }]}
          activeChannelId=""
          participants={[]}
          joined={false}
          busy={false}
          screenSharing={false}
          occupancy={[]}
          onSelectChannel={vi.fn()}
          onLeave={vi.fn()}
          onShare={vi.fn()}
          onOpenParticipant={vi.fn()}
          {...extra}
        />
      </TooltipProvider>,
    );

  it('lists a category’s channels under it, and folds it away', () => {
    render_();
    const category = screen.getByRole('button', { name: 'STAFF' });
    const section = category.closest('section')!;
    expect(within(section).getByText('logs')).toBeInTheDocument();
    expect(within(section).getByText('Staff call')).toBeInTheDocument();
    expect(screen.getByText('general').closest('section')).not.toBe(section);
    fireEvent.click(category);
    expect(category).toHaveAttribute('aria-expanded', 'false');
    expect(within(section).queryByText('logs')).toBeNull();
  });

  it('offers a channel in the category, the category’s settings and a new category only to people who shape channels', () => {
    const onCreateChannel = vi.fn();
    const onEditCategory = vi.fn();
    render_({ onCreateChannel, onEditCategory, onCreateCategory: vi.fn() });
    fireEvent.click(screen.getByRole('button', { name: 'Create channel in STAFF' }));
    expect(onCreateChannel).toHaveBeenCalledWith('text', 'c1');
    fireEvent.click(screen.getByRole('button', { name: 'Edit STAFF' }));
    expect(onEditCategory).toHaveBeenCalledWith('c1');
    expect(screen.getByRole('button', { name: /Create category/ })).toBeInTheDocument();
    cleanup();
    render_();
    expect(screen.queryByRole('button', { name: 'Create channel in STAFF' })).toBeNull();
    expect(screen.queryByRole('button', { name: /Create category/ })).toBeNull();
  });
});
