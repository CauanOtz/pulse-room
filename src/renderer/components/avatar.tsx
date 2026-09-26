import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
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
  /**
   * When a moving picture moves. In a list it waits for the pointer, the way
   * a face in a crowd only turns when you look at it; on an open profile it
   * always plays, because that is the one place somebody came to look.
   */
  animate?: 'always' | 'hover';
}

/**
 * A person or a room, drawn as their picture when they have one and as their
 * initials when they do not. A picture that cannot be loaded falls back to the
 * initials rather than leaving a hole.
 */
export function Avatar({ name, initials, imageId, accent, className, animate = 'hover' }: AvatarProps) {
  const images = useImages();
  const host = useRef<HTMLSpanElement>(null);
  const [still, setStill] = useState<string>();
  const [moving, setMoving] = useState<string>();
  const [animated, setAnimated] = useState(false);
  const [hovered, setHovered] = useState(false);

  useEffect(() => {
    setStill(undefined);
    setMoving(undefined);
    setAnimated(false);
    if (!imageId || !images) return undefined;
    let current = true;
    void (animate === 'always' ? images.url(imageId) : images.still(imageId))
      .then((value) => current && setStill(value))
      .catch(() => undefined);
    void images
      .isAnimated(imageId)
      .then((value) => current && setAnimated(value))
      .catch(() => undefined);
    return () => {
      current = false;
    };
  }, [imageId, images, animate]);

  // A row is what the pointer is on, not the thirty pixels of its picture:
  // anything marked as a hover scope wakes every face inside it.
  useEffect(() => {
    if (animate !== 'hover' || !animated) return undefined;
    const element = host.current;
    const scope = element?.closest('[data-hover-scope]') ?? element;
    if (!scope) return undefined;
    const enter = () => setHovered(true);
    const leave = () => setHovered(false);
    scope.addEventListener('pointerenter', enter);
    scope.addEventListener('pointerleave', leave);
    return () => {
      scope.removeEventListener('pointerenter', enter);
      scope.removeEventListener('pointerleave', leave);
    };
  }, [animate, animated]);

  useEffect(() => {
    if (!hovered || !animated || !imageId || !images) return undefined;
    let current = true;
    void images
      .url(imageId)
      .then((value) => current && setMoving(value))
      .catch(() => undefined);
    return () => {
      current = false;
    };
  }, [hovered, animated, imageId, images]);

  const url = hovered && moving ? moving : still;

  return (
    <span
      ref={host}
      className={cn(
        // The picture is drawn absolutely, so nothing inside gives this box a
        // size: every caller has to say how big its avatar is.
        'avatar relative isolate grid place-items-center overflow-hidden select-none',
        className,
        url && 'has-picture text-transparent',
      )}
      style={accent ? { background: accent } : undefined}
      data-animated={animated ? (url === moving || animate === 'always' ? 'playing' : 'still') : undefined}
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
