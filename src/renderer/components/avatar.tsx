import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { ImageCache } from '../infrastructure/image-cache';
import { cn } from './ui/utils';

const ImagesContext = createContext<ImageCache | undefined>(undefined);

export function ImagesProvider({ images, children }: { images: ImageCache; children: ReactNode }) {
  return <ImagesContext.Provider value={images}>{children}</ImagesContext.Provider>;
}

export const useImages = (): ImageCache | undefined => useContext(ImagesContext);

interface AvatarProps {
  name: string;
  initials?: string;
  imageId?: string | null;
  accent?: string;
  className?: string;
}

/**
 * A person or a room, drawn as their picture when they have one and as their
 * initials when they do not. A picture that cannot be loaded falls back to the
 * initials rather than leaving a hole.
 */
export function Avatar({ name, initials, imageId, accent, className }: AvatarProps) {
  const images = useImages();
  const [url, setUrl] = useState<string>();

  useEffect(() => {
    setUrl(undefined);
    if (!imageId || !images) return undefined;
    let current = true;
    void images
      .url(imageId)
      .then((value) => current && setUrl(value))
      .catch(() => undefined);
    return () => {
      current = false;
    };
  }, [imageId, images]);

  return (
    <span
      className={cn(
        // The picture is drawn absolutely, so with one there is nothing left to
        // give the box a height: it fills its parent unless told otherwise.
        'avatar relative isolate grid size-full place-items-center overflow-hidden select-none',
        className,
        url && 'has-picture text-transparent',
      )}
      style={accent ? { background: accent } : undefined}
      aria-hidden="true"
    >
      {url ? (
        <img className="absolute inset-0 size-full object-cover" src={url} alt="" draggable={false} />
      ) : (
        (initials ?? name.slice(0, 2).toUpperCase())
      )}
    </span>
  );
}
