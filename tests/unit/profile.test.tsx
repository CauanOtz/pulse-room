import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Avatar, ImagesProvider } from '../../src/renderer/components/avatar';
import { ProfileCard } from '../../src/renderer/components/profile-card';
import { ProfilePopover } from '../../src/renderer/components/profile-popover';
import { TagWearer, ThemeEditor } from '../../src/renderer/components/profile-editors';
import { TagManager } from '../../src/renderer/components/tag-manager';
import { Permission } from '../../src/shared/permissions';
import { AccountDialog } from '../../src/renderer/components/account-dialog';
import { TagChip } from '../../src/renderer/components/profile-identity';
import { TooltipProvider } from '../../src/renderer/components/ui/tooltip';
import { ImageCache } from '../../src/renderer/infrastructure/image-cache';
import type { CommunityClient } from '../../src/renderer/infrastructure/community-client';
import type {
  Account,
  CommunityDetail,
  Role,
  ServerTagDefinition,
  TagChoice,
  WornTag,
} from '../../src/shared/community';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const worn: WornTag = { serverId: 's1', serverName: 'Den', text: 'DEN', badge: 'flame', colour: '#e0452b' };
const owner: Account = { id: 'u1', username: 'merge', displayName: 'merge' };

/** A cache that answers at once, so what is drawn can be read straight away. */
const fakeImages = (animated: boolean) =>
  ({
    url: vi.fn(async () => 'blob:moving'),
    still: vi.fn(async () => (animated ? 'blob:still' : 'blob:moving')),
    isAnimated: vi.fn(async () => animated),
  }) as unknown as ImageCache;

const shown = () => document.querySelector('.avatar img')?.getAttribute('src');

describe('a moving picture', () => {
  it('stays on its first frame in a list, and plays while its row is under the pointer', async () => {
    render(
      <ImagesProvider images={fakeImages(true)}>
        <div data-hover-scope data-testid="row">
          <span>babi</span>
          <Avatar name="babi" imageId={'a'.repeat(64)} />
        </div>
      </ImagesProvider>,
    );
    await waitFor(() => expect(shown()).toBe('blob:still'));
    expect(document.querySelector('.avatar')).toHaveAttribute('data-animated', 'still');

    // The row, not the picture: pointing at the name wakes the face.
    fireEvent.pointerEnter(screen.getByTestId('row'));
    await waitFor(() => expect(shown()).toBe('blob:moving'));
    expect(document.querySelector('.avatar')).toHaveAttribute('data-animated', 'playing');

    fireEvent.pointerLeave(screen.getByTestId('row'));
    await waitFor(() => expect(shown()).toBe('blob:still'));
  });

  it('always plays where somebody came to look at it', async () => {
    render(
      <ImagesProvider images={fakeImages(true)}>
        <Avatar name="babi" imageId={'a'.repeat(64)} animate="always" />
      </ImagesProvider>,
    );
    await waitFor(() => expect(shown()).toBe('blob:moving'));
  });

  it('never fetches a moving copy of a picture that does not move', async () => {
    const images = fakeImages(false);
    render(
      <ImagesProvider images={images}>
        <div data-hover-scope data-testid="row">
          <Avatar name="babi" imageId={'a'.repeat(64)} />
        </div>
      </ImagesProvider>,
    );
    await waitFor(() => expect(shown()).toBe('blob:moving'));
    fireEvent.pointerEnter(screen.getByTestId('row'));
    await act(async () => undefined);
    expect(images.url).not.toHaveBeenCalled();
    expect(document.querySelector('.avatar')).not.toHaveAttribute('data-animated');
  });
});

describe('ImageCache, animated', () => {
  const cacheOf = (type: string) => {
    const api = { blob: vi.fn(async () => new Blob(['x'], { type })) } as unknown as CommunityClient;
    return { api, images: new ImageCache(api) };
  };

  it('knows a GIF moves and a PNG does not', async () => {
    expect(await cacheOf('image/gif').images.isAnimated('g')).toBe(true);
    expect(await cacheOf('image/png').images.isAnimated('p')).toBe(false);
  });

  it('draws the first frame of a GIF into a picture of its own', async () => {
    const close = vi.fn();
    vi.stubGlobal('createImageBitmap', vi.fn(async () => ({ width: 8, height: 8, close })));
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ drawImage: vi.fn() } as never);
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((done) =>
      done(new Blob(['still'], { type: 'image/png' })),
    );
    const { api, images } = cacheOf('image/gif');

    const [moving, still] = await Promise.all([images.url('g'), images.still('g')]);

    expect(still).not.toBe(moving);
    expect(close).toHaveBeenCalled();
    // One download serves both: the still frame is made from bytes already here.
    expect(api.blob).toHaveBeenCalledTimes(1);
  });

  it('shows the moving picture rather than nothing if a still frame cannot be made', async () => {
    vi.stubGlobal('createImageBitmap', vi.fn(async () => Promise.reject(new Error('no decoder'))));
    const { images } = cacheOf('image/gif');
    expect(await images.still('g')).toBe(await images.url('g'));
  });
});

describe('TagChip', () => {
  it('says which server a worn tag belongs to', () => {
    render(
      <TooltipProvider>
        <TagChip tag={worn} />
      </TooltipProvider>,
    );
    expect(screen.getByLabelText('DEN, the tag of Den')).toHaveStyle({ color: '#e0452b' });
  });
});

describe('ProfilePopover', () => {
  const open = (profile: Parameters<typeof ProfilePopover>[0]['profile'], images = fakeImages(false)) =>
    render(
      <TooltipProvider>
        <ImagesProvider images={images}>
          <ProfilePopover profile={profile} position={{ x: 400, y: 200 }} onClose={() => undefined} />
        </ImagesProvider>
      </TooltipProvider>,
    );
  const banner = () => document.querySelector('.profile-banner');

  it('draws a quiet strip for somebody with no banner and no colours', () => {
    open({ id: 'u1', displayName: 'merge' });
    expect(banner()).toHaveAttribute('data-banner', 'plain');
    expect(screen.getByRole('dialog')).not.toHaveAttribute('data-themed');
  });

  it('lets the colours stand in for a banner nobody chose', () => {
    open({ id: 'u1', displayName: 'merge', theme: { primary: '#112233', accent: '#445566' } });
    expect(banner()).toHaveAttribute('data-banner', 'theme');
    expect(screen.getByRole('dialog')).toHaveAttribute('data-themed', 'true');
  });

  it('shows the banner itself when there is one, and the tag beside the name', async () => {
    open({ id: 'u1', displayName: 'merge', bannerId: 'b'.repeat(64), tag: worn });
    await waitFor(() => expect(banner()).toHaveAttribute('data-banner', 'picture'));
    expect(screen.getByRole('heading', { name: /merge/ })).toContainElement(
      screen.getByLabelText('DEN, the tag of Den'),
    );
  });
});

describe('ProfileCard, your own', () => {
  const show = (user: Account, onOpenAccount?: () => void) =>
    render(
      <TooltipProvider>
        <ImagesProvider images={fakeImages(false)}>
          <ProfileCard user={user} onOpenAccount={onOpenAccount} />
        </ImagesProvider>
      </TooltipProvider>,
    );
  const banner = () => document.querySelector('.profile-card .profile-banner');

  it('wears the banner you chose, with your tag and bio', async () => {
    show({ ...owner, bannerId: 'b'.repeat(64), tag: worn, bio: 'up late' });
    await waitFor(() => expect(banner()).toHaveAttribute('data-banner', 'picture'));
    expect(screen.getByLabelText('DEN, the tag of Den')).toBeInTheDocument();
    expect(screen.getByText('up late')).toBeInTheDocument();
  });

  it('paints your colours across the top when there is no banner', () => {
    show({ ...owner, theme: { primary: '#112233', accent: '#445566' } });
    expect(banner()).toHaveAttribute('data-banner', 'theme');
  });

  it('opens the account from your face, with no separate button for it', () => {
    const onOpenAccount = vi.fn();
    show(owner, onOpenAccount);
    const face = screen.getByRole('button', { name: 'Account settings' });
    expect(face).toContainElement(document.querySelector('.avatar'));
    expect(screen.getAllByRole('button', { name: 'Account settings' })).toHaveLength(1);
    fireEvent.click(face);
    expect(onOpenAccount).toHaveBeenCalledTimes(1);
  });

  it('is only a picture where there is no account to open', () => {
    show(owner);
    expect(screen.queryByRole('button', { name: 'Account settings' })).toBeNull();
  });
});

describe('TagWearer', () => {
  const choices: TagChoice[] = [
    {
      serverId: 's1',
      serverName: 'Den',
      tags: [
        { id: 't1', text: 'DEN', badge: 'flame', colour: '#e0452b', name: 'Regulars' },
        { id: 't2', text: 'MOD', badge: 'star', colour: '#6a5acd', name: '' },
      ],
      activeId: 't2',
    },
    { serverId: 's2', serverName: 'Attic', tags: [{ id: 't3', text: 'ATC', badge: 'moon', colour: '#45cf8a', name: '' }], activeId: null },
  ];
  const clientWith = (list: TagChoice[]) =>
    ({ request: vi.fn(async () => ({ choices: list })) }) as unknown as CommunityClient;

  it('offers one choice per server, showing the tag worn there', async () => {
    render(
      <TooltipProvider>
        <TagWearer api={clientWith(choices)} onChanged={async () => undefined} />
      </TooltipProvider>,
    );
    const den = await screen.findByRole('combobox', { name: 'Tag in Den' });
    expect(den).toHaveTextContent('MOD');
    expect(screen.getByRole('combobox', { name: 'Tag in Attic' })).toHaveTextContent('None');
  });

  it('says so when no server offers a tag', async () => {
    render(
      <TooltipProvider>
        <TagWearer api={clientWith([])} onChanged={async () => undefined} />
      </TooltipProvider>,
    );
    expect(await screen.findByText(/None of your servers offers you a tag yet/)).toBeInTheDocument();
  });
});

describe('TagManager', () => {
  const roles: Role[] = [
    { id: 'r-everyone', name: '@everyone', colour: null, position: 0, permissions: 0, isDefault: true, hoist: false },
    { id: 'r-dev', name: 'Developer', colour: '#45cf8a', position: 1, permissions: 0, isDefault: false, hoist: false },
  ];
  const tags: ServerTagDefinition[] = [
    { id: 't1', text: 'DEV', badge: 'gamepad', colour: '#45cf8a', name: 'Developers', mode: 'roles', roleIds: ['r-dev'], holderIds: [] },
    { id: 't2', text: 'WIN', badge: 'crown', colour: '#ffcc00', name: '', mode: 'assigned', roleIds: [], holderIds: ['u1'] },
  ];
  const detailWith = (permissions: number): CommunityDetail => ({
    server: { id: 's1', name: 'Den', role: 'member', permissions },
    channels: [],
    members: [{ ...owner, role: 'member', roleIds: [] }],
    roles,
    tags,
  });
  const show = (permissions: number, api = { request: vi.fn(async () => ({})) } as unknown as CommunityClient) =>
    render(
      <TooltipProvider>
        <TagManager api={api} detail={detailWith(permissions)} userId={owner.id} onChanged={async () => undefined} />
      </TooltipProvider>,
    );

  it('describes who may wear each tag', () => {
    show(Permission.ManageTags);
    expect(screen.getByText('Available to: Developer. Members can equip it.')).toBeInTheDocument();
    expect(screen.getByText('Staff assign it · 1 holder.')).toBeInTheDocument();
  });

  it('keeps the controls to people with Manage tags', () => {
    show(0);
    expect(screen.queryByRole('button', { name: /Create tag/ })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Edit DEV' })).toBeNull();
  });

  it('keeps only letters and digits, and will not save an empty tag or a role tag with no role', () => {
    show(Permission.ManageTags);
    fireEvent.click(screen.getByRole('button', { name: /Create tag/ }));
    const field = screen.getByLabelText('Tag');
    fireEvent.change(field, { target: { value: 'a-b c!' } });
    expect(field).toHaveValue('abc');
    fireEvent.change(field, { target: { value: '' } });
    expect(screen.getByRole('button', { name: 'Save tag' })).toBeDisabled();
    fireEvent.change(field, { target: { value: 'OK' } });
    fireEvent.click(screen.getByRole('radio', { name: /Selected roles/ }));
    expect(screen.getByRole('button', { name: 'Save tag' })).toBeDisabled();
    fireEvent.click(screen.getByRole('checkbox', { name: /Developer/ }));
    expect(screen.getByRole('button', { name: 'Save tag' })).toBeEnabled();
  });

  it('creates a tag with its text, badge, colour, name and rule together', async () => {
    const api = { request: vi.fn(async () => ({})) } as unknown as CommunityClient;
    show(Permission.ManageTags, api);
    fireEvent.click(screen.getByRole('button', { name: /Create tag/ }));
    fireEvent.change(screen.getByLabelText('Tag'), { target: { value: 'NYX' } });
    fireEvent.change(screen.getByLabelText('What it stands for'), { target: { value: 'Night owls' } });
    fireEvent.click(screen.getByRole('radio', { name: 'Moon' }));
    fireEvent.click(screen.getByRole('button', { name: 'Colour: #6a5acd' }));
    fireEvent.click(screen.getByRole('radio', { name: /Staff assign it/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Save tag' }));
    await waitFor(() =>
      expect(api.request).toHaveBeenCalledWith('/api/servers/s1/tags', 'POST', {
        text: 'NYX',
        badge: 'moon',
        colour: '#6a5acd',
        name: 'Night owls',
        mode: 'assigned',
        roleIds: [],
      }),
    );
  });

  it('hands an assigned tag out from its own editor', async () => {
    const api = { request: vi.fn(async () => ({})) } as unknown as CommunityClient;
    show(Permission.ManageTags, api);
    fireEvent.click(screen.getByRole('button', { name: 'Edit WIN' }));
    const holder = screen.getByRole('checkbox', { name: `Give ${owner.displayName} this tag` });
    expect(holder).toBeChecked();
    fireEvent.click(holder);
    await waitFor(() => expect(api.request).toHaveBeenCalledWith(`/api/tags/t2/holders/${owner.id}`, 'DELETE'));
  });
});

describe('ThemeEditor', () => {
  const edit = (value: Parameters<typeof ThemeEditor>[0]['value'], saved = value) => {
    const onChange = vi.fn();
    render(<ThemeEditor value={value} saved={saved} onChange={onChange} />);
    return onChange;
  };

  it('switches the colours on from what was saved, or from a pair that works', () => {
    expect(edit(null)).not.toHaveBeenCalled();
    fireEvent.click(screen.getByLabelText('Use my own colours'));
    expect(screen.getByLabelText('Use my own colours')).not.toBeChecked();
    cleanup();

    const onChange = edit(null);
    fireEvent.click(screen.getByLabelText('Use my own colours'));
    expect(onChange).toHaveBeenLastCalledWith({ primary: '#6a5acd', accent: '#e8508a' });
    cleanup();

    const back = edit(null, { primary: '#111111', accent: '#222222' });
    fireEvent.click(screen.getByLabelText('Use my own colours'));
    expect(back).toHaveBeenLastCalledWith({ primary: '#111111', accent: '#222222' });
  });

  it('changes one colour at a time', () => {
    const onChange = edit({ primary: '#111111', accent: '#222222' });
    fireEvent.click(screen.getByRole('button', { name: 'Primary: #45cf8a' }));
    expect(onChange).toHaveBeenLastCalledWith({ primary: '#45cf8a', accent: '#222222' });
  });

  it('only takes a real colour from the text box', () => {
    const onChange = edit({ primary: '#111111', accent: '#222222' });
    const hex = screen.getByLabelText('Primary, hex');
    fireEvent.change(hex, { target: { value: '#12' } });
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.change(hex, { target: { value: 'ABCDEF' } });
    expect(onChange).toHaveBeenLastCalledWith({ primary: '#abcdef', accent: '#222222' });
  });

  it('hands the card back to the application colours when switched off', () => {
    const onChange = edit({ primary: '#111111', accent: '#222222' });
    fireEvent.click(screen.getByLabelText('Use my own colours'));
    expect(onChange).toHaveBeenLastCalledWith(null);
  });
});

describe('AccountDialog', () => {
  const account: Account = { ...owner, bio: 'hi', theme: null };
  const setUp = () => {
    const api = {
      request: vi.fn(async (url: string) => (url === '/api/servers' ? { servers: [] } : {})),
      upload: vi.fn(async () => ({})),
    } as unknown as CommunityClient;
    const onProfileChanged = vi.fn(async () => undefined);
    const onClose = vi.fn();
    render(
      <TooltipProvider>
        <AccountDialog
          api={api}
          user={account}
          onClose={onClose}
          onLogout={async () => undefined}
          onProfileChanged={onProfileChanged}
        />
      </TooltipProvider>,
    );
    return { api, onProfileChanged, onClose };
  };
  const section = (name: string) => screen.getByRole('button', { name: new RegExp(`^${name}`) });

  it('opens on the profile, and keeps each part of the account in its own section', () => {
    setUp();
    expect(section('Profile')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByLabelText('Bio')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Change password' })).toBeNull();

    fireEvent.click(section('Security'));
    expect(screen.getByRole('button', { name: 'Change password' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Sign out/ })).toBeInTheDocument();
    expect(screen.queryByLabelText('Bio')).toBeNull();

    fireEvent.click(section('Personalization'));
    expect(screen.getByLabelText('Use my own colours')).toBeInTheDocument();
  });

  it('keeps the card beside what is being edited, drawn from the drafts', () => {
    setUp();
    const preview = () => screen.getByRole('complementary', { name: 'Live preview' });
    fireEvent.change(screen.getByLabelText('Bio'), { target: { value: 'written, not saved' } });
    expect(preview()).toHaveTextContent('written, not saved');

    fireEvent.click(section('Personalization'));
    fireEvent.click(screen.getByLabelText('Use my own colours'));
    expect(preview()).toHaveTextContent('written, not saved');
    expect(within(preview()).getByRole('img', { name: 'Profile preview' })).toHaveAttribute('data-themed', 'true');
  });

  it('holds nothing pending until something changes', () => {
    setUp();
    expect(screen.queryByRole('region', { name: 'Unsaved changes' })).toBeNull();
  });

  it('keeps a change pending across sections, and marks where it is', () => {
    setUp();
    fireEvent.change(screen.getByLabelText('Bio'), { target: { value: 'new words' } });
    expect(screen.getByRole('region', { name: 'Unsaved changes' })).toBeInTheDocument();

    fireEvent.click(section('Security'));
    // Still there from another section, and the section it came from says so.
    expect(screen.getByRole('region', { name: 'Unsaved changes' })).toBeInTheDocument();
    expect(section('Profile')).toContainElement(screen.getByLabelText('Unsaved changes', { selector: 'span' }));

    fireEvent.click(section('Profile'));
    expect(screen.getByLabelText('Bio')).toHaveValue('new words');
  });

  it('saves the bio and the colours together, and nothing that did not change', async () => {
    const { api, onProfileChanged } = setUp();
    fireEvent.change(screen.getByLabelText('Bio'), { target: { value: '  new words  ' } });
    fireEvent.click(section('Personalization'));
    fireEvent.click(screen.getByLabelText('Use my own colours'));
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(onProfileChanged).toHaveBeenCalled());
    expect(api.request).toHaveBeenCalledWith('/api/account/profile', 'PATCH', { bio: 'new words' });
    expect(api.request).toHaveBeenCalledWith('/api/account/theme', 'PATCH', {
      theme: { primary: '#6a5acd', accent: '#e8508a' },
    });
  });

  it('only sends the part that changed', async () => {
    const { api, onProfileChanged } = setUp();
    fireEvent.change(screen.getByLabelText('Bio'), { target: { value: 'only this' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(onProfileChanged).toHaveBeenCalled());
    expect(api.request).not.toHaveBeenCalledWith('/api/account/theme', 'PATCH', expect.anything());
  });

  it('puts everything back with Reset', () => {
    setUp();
    fireEvent.change(screen.getByLabelText('Bio'), { target: { value: 'changed my mind' } });
    fireEvent.click(screen.getByRole('button', { name: 'Reset' }));
    expect(screen.getByLabelText('Bio')).toHaveValue('hi');
    expect(screen.queryByRole('region', { name: 'Unsaved changes' })).toBeNull();
  });

  it('asks before throwing away a change on the way out', async () => {
    const { onClose } = setUp();
    fireEvent.change(screen.getByLabelText('Bio'), { target: { value: 'unsaved' } });
    fireEvent.click(screen.getByRole('button', { name: 'Close dialog' }));
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(await screen.findByRole('button', { name: 'Discard' }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it('closes at once when there is nothing to lose', () => {
    const { onClose } = setUp();
    fireEvent.click(screen.getByRole('button', { name: 'Close dialog' }));
    expect(onClose).toHaveBeenCalled();
  });
});
