import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { ImageCache } from '../infrastructure/image-cache';

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

  const classes = ['avatar', className, url ? 'has-picture' : undefined].filter(Boolean).join(' ');
  return (
    <span className={classes} style={accent ? { background: accent } : undefined} aria-hidden="true">
      {url ? <img src={url} alt="" draggable={false} /> : (initials ?? name.slice(0, 2).toUpperCase())}
    </span>
  );
}
