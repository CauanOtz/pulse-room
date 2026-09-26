import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Avatar, ImagesProvider } from '../../src/renderer/components/avatar';
import { ProfilePopover } from '../../src/renderer/components/profile-popover';
import { ServerTagEditor, TagWearer, ThemeEditor } from '../../src/renderer/components/profile-editors';
import { TagChip } from '../../src/renderer/components/profile-identity';
import { TooltipProvider } from '../../src/renderer/components/ui/tooltip';
import { ImageCache } from '../../src/renderer/infrastructure/image-cache';
import type { CommunityClient } from '../../src/renderer/infrastructure/community-client';
import type { Account, Community, WornTag } from '../../src/shared/community';

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

describe('TagWearer', () => {
  const servers: Community[] = [
    { id: 's1', name: 'Den', role: 'member', tag: { text: 'DEN', badge: 'flame', colour: '#e0452b' } },
    { id: 's2', name: 'Attic', role: 'owner', tag: null },
  ];
  const clientWith = (patch: () => Promise<unknown>) =>
    ({
      request: vi.fn(async (url: string, method?: string) => (method === 'PATCH' ? patch() : { servers })),
    }) as unknown as CommunityClient;

  it('offers only the servers that have a tag, and none', async () => {
    render(
      <TooltipProvider>
        <TagWearer api={clientWith(async () => ({}))} user={owner} onChanged={async () => undefined} />
      </TooltipProvider>,
    );
    expect(await screen.findByRole('radio', { name: 'Wear the DEN tag of Den' })).toBeInTheDocument();
    expect(screen.queryByText('Attic')).toBeNull();
    expect(screen.getByRole('radio', { name: 'None' })).toBeChecked();
  });

  it('puts the tag on, and says so', async () => {
    const onChanged = vi.fn(async () => undefined);
    const api = clientWith(async () => ({}));
    render(
      <TooltipProvider>
        <TagWearer api={api} user={owner} onChanged={onChanged} />
      </TooltipProvider>,
    );
    fireEvent.click(await screen.findByRole('radio', { name: 'Wear the DEN tag of Den' }));
    // The dot moves at once, before the service has answered.
    expect(screen.getByRole('radio', { name: 'Wear the DEN tag of Den' })).toBeChecked();
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
    expect(api.request).toHaveBeenCalledWith('/api/account/tag', 'PATCH', { serverId: 's1' });
  });

  it('puts the dot back and says why when the service refuses', async () => {
    render(
      <TooltipProvider>
        <TagWearer
          api={clientWith(async () => Promise.reject(new Error('You can only wear the tag of a server you are in.')))}
          user={owner}
          onChanged={async () => undefined}
        />
      </TooltipProvider>,
    );
    fireEvent.click(await screen.findByRole('radio', { name: 'Wear the DEN tag of Den' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('server you are in');
    expect(screen.getByRole('radio', { name: 'None' })).toBeChecked();
  });
});

describe('ServerTagEditor', () => {
  const renderEditor = (canEdit: boolean, api = { request: vi.fn(async () => ({})) } as unknown as CommunityClient) =>
    render(
      <ServerTagEditor api={api} serverId="s1" tag={null} canEdit={canEdit} onChanged={async () => undefined} />,
    );

  it('keeps only letters and digits, and will not save an empty tag', () => {
    renderEditor(true);
    const field = screen.getByLabelText('Tag');
    fireEvent.change(field, { target: { value: 'a-b c!' } });
    expect(field).toHaveValue('abc');
    fireEvent.change(field, { target: { value: '' } });
    expect(screen.getByRole('button', { name: 'Save tag' })).toBeDisabled();
  });

  it('saves the text, the badge and the colour together', async () => {
    const api = { request: vi.fn(async () => ({})) } as unknown as CommunityClient;
    renderEditor(true, api);
    fireEvent.change(screen.getByLabelText('Tag'), { target: { value: 'NYX' } });
    fireEvent.click(screen.getByRole('radio', { name: 'Moon' }));
    fireEvent.click(screen.getByRole('button', { name: 'Colour: #6a5acd' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save tag' }));
    await waitFor(() =>
      expect(api.request).toHaveBeenCalledWith('/api/servers/s1/tag', 'PATCH', {
        tag: { text: 'NYX', badge: 'moon', colour: '#6a5acd' },
      }),
    );
    expect(await screen.findByRole('status')).toHaveTextContent('Tag saved.');
  });

  it('shows the rule, not the controls, to somebody who cannot change it', () => {
    renderEditor(false);
    expect(screen.queryByLabelText('Tag')).toBeNull();
    expect(screen.getByText('This server has no tag yet.')).toBeInTheDocument();
  });
});

describe('ThemeEditor', () => {
  it('previews a colour before it is kept, and can take it back', () => {
    const onPreview = vi.fn();
    render(<ThemeEditor theme={null} onPreview={onPreview} onSave={async () => undefined} />);
    expect(screen.getByRole('button', { name: 'Save colours' })).toBeDisabled();

    fireEvent.click(screen.getByLabelText('Use my own colours'));
    expect(onPreview).toHaveBeenLastCalledWith({ primary: '#6a5acd', accent: '#e8508a' });
    fireEvent.click(screen.getByRole('button', { name: 'Primary: #45cf8a' }));
    expect(onPreview).toHaveBeenLastCalledWith({ primary: '#45cf8a', accent: '#e8508a' });

    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(onPreview).toHaveBeenLastCalledWith(null);
    expect(screen.getByLabelText('Use my own colours')).not.toBeChecked();
  });

  it('only takes a real colour from the text box', () => {
    const onPreview = vi.fn();
    render(
      <ThemeEditor theme={{ primary: '#111111', accent: '#222222' }} onPreview={onPreview} onSave={async () => undefined} />,
    );
    const hex = screen.getByLabelText('Primary, hex');
    fireEvent.change(hex, { target: { value: '#12' } });
    expect(onPreview).not.toHaveBeenCalled();
    fireEvent.change(hex, { target: { value: 'ABCDEF' } });
    expect(onPreview).toHaveBeenLastCalledWith({ primary: '#abcdef', accent: '#222222' });
  });

  it('hands the card back to the application colours when switched off', async () => {
    const onSave = vi.fn(async () => undefined);
    render(<ThemeEditor theme={{ primary: '#111111', accent: '#222222' }} onPreview={() => undefined} onSave={onSave} />);
    fireEvent.click(screen.getByLabelText('Use my own colours'));
    fireEvent.click(screen.getByRole('button', { name: 'Save colours' }));
    await waitFor(() => expect(onSave).toHaveBeenCalledWith(null));
    expect(await screen.findByRole('status')).toHaveTextContent('Colours saved.');
  });
});
