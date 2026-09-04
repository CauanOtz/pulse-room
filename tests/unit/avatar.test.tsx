import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Avatar, ImagesProvider } from '../../src/renderer/components/avatar';
import { ImageCache } from '../../src/renderer/infrastructure/image-cache';
import { toSquareImage } from '../../src/renderer/infrastructure/square-image';
import type { CommunityClient } from '../../src/renderer/infrastructure/community-client';

afterEach(cleanup);

const cacheWith = (blob: () => Promise<Blob>) => {
  const api = { blob: vi.fn(blob) } as unknown as CommunityClient;
  return { api, images: new ImageCache(api) };
};

describe('Avatar', () => {
  it('shows initials for somebody without a picture', () => {
    render(<Avatar name="Merge lounge" initials="ML" />);
    expect(screen.getByText('ML')).toBeInTheDocument();
  });

  it('shows the picture once it arrives', async () => {
    const { images } = cacheWith(async () => new Blob(['x'], { type: 'image/png' }));
    render(
      <ImagesProvider images={images}>
        <Avatar name="babi" initials="B" imageId={'a'.repeat(64)} />
      </ImagesProvider>,
    );

    await waitFor(() => expect(document.querySelector('.avatar img')).toBeInTheDocument());
    expect(document.querySelector('.avatar')).toHaveClass('has-picture');
  });

  it('keeps the initials when the picture cannot be read', async () => {
    const { images } = cacheWith(async () => {
      throw new Error('denied');
    });
    render(
      <ImagesProvider images={images}>
        <Avatar name="babi" initials="B" imageId={'b'.repeat(64)} />
      </ImagesProvider>,
    );

    await waitFor(() => expect(screen.getByText('B')).toBeInTheDocument());
    expect(document.querySelector('.avatar img')).toBeNull();
  });
});

describe('ImageCache', () => {
  it('asks for a picture once, however many people draw it', async () => {
    const { api, images } = cacheWith(async () => new Blob(['x'], { type: 'image/png' }));

    const [first, second] = await Promise.all([images.url('abc'), images.url('abc')]);

    expect(first).toBe(second);
    expect(api.blob).toHaveBeenCalledTimes(1);
  });

  it('does not remember a failure as if it were a picture', async () => {
    let attempts = 0;
    const { images } = cacheWith(async () => {
      attempts += 1;
      if (attempts === 1) throw new Error('denied');
      return new Blob(['x'], { type: 'image/png' });
    });

    await expect(images.url('abc')).rejects.toThrow('denied');
    await expect(images.url('abc')).resolves.toContain('blob:');
  });
});

describe('toSquareImage', () => {
  it('refuses a document pretending to be a picture', async () => {
    await expect(toSquareImage(new Blob(['<svg/>'], { type: 'image/svg+xml' }))).rejects.toThrow(/PNG/);
    await expect(toSquareImage(new Blob(['{}'], { type: 'application/json' }))).rejects.toThrow(/PNG/);
  });
});
