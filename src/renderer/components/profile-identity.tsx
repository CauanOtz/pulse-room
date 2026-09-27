import { useEffect, useState, type CSSProperties } from 'react';
import {
  Crown,
  Flame,
  Gamepad2,
  Gem,
  Heart,
  Leaf,
  Moon,
  Music,
  Skull,
  Sparkles,
  Star,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import type { ProfileTheme, ServerTag, TagBadge, WornTag } from '../../shared/community';
import { useImages } from './avatar';
import { Tooltip } from './ui/tooltip';
import { cn } from './ui/utils';

/** One glyph per badge the service accepts, and no others. */
export const badgeIcons: Record<TagBadge, LucideIcon> = {
  spark: Sparkles,
  heart: Heart,
  star: Star,
  moon: Moon,
  flame: Flame,
  leaf: Leaf,
  bolt: Zap,
  crown: Crown,
  skull: Skull,
  gem: Gem,
  music: Music,
  gamepad: Gamepad2,
};

export const badgeNames: Record<TagBadge, string> = {
  spark: 'Spark',
  heart: 'Heart',
  star: 'Star',
  moon: 'Moon',
  flame: 'Flame',
  leaf: 'Leaf',
  bolt: 'Bolt',
  crown: 'Crown',
  skull: 'Skull',
  gem: 'Gem',
  music: 'Music',
  gamepad: 'Gamepad',
};

/**
 * A server's short name worn beside a person's own, the way a jersey carries a
 * club. Small enough to sit inside a line of chat without pushing the message
 * along, and it says which server it belongs to when somebody asks.
 */
export function TagChip({
  tag,
  size = 'sm',
  className,
}: {
  tag: ServerTag | WornTag;
  size?: 'xs' | 'sm';
  className?: string;
}) {
  const Icon = badgeIcons[tag.badge] ?? Sparkles;
  const chip = (
    <span
      className={cn(
        'server-tag inline-flex shrink-0 items-center gap-1 rounded-[5px] border font-bold uppercase leading-none tracking-[0.06em]',
        size === 'xs' ? 'h-4 px-1 text-[9px]' : 'h-[18px] px-1.5 text-[10px]',
        className,
      )}
      style={{
        color: tag.colour,
        borderColor: `color-mix(in srgb, ${tag.colour} 38%, transparent)`,
        background: `color-mix(in srgb, ${tag.colour} 14%, transparent)`,
      }}
      aria-label={'serverName' in tag ? `${tag.text}, the tag of ${tag.serverName}` : `${tag.text} tag`}
    >
      <Icon aria-hidden="true" className={size === 'xs' ? 'size-2.5' : 'size-3'} strokeWidth={2.4} />
      {tag.text}
    </span>
  );
  // Only a worn tag has a server to name; a preview in settings does not.
  return 'serverName' in tag ? <Tooltip label={`Tag of ${tag.serverName}`}>{chip}</Tooltip> : chip;
}

/** The gradient a theme paints, from its first colour down to its second. */
export function themeGradient(theme: ProfileTheme | null | undefined): string | undefined {
  return theme ? `linear-gradient(180deg, ${theme.primary}, ${theme.accent})` : undefined;
}

/**
 * How a themed card is painted. The colours frame the card and tint the
 * surface; the surface itself stays dark enough that text on it is always
 * readable, whatever two colours somebody picked.
 */
export function themedCard(theme: ProfileTheme | null | undefined): CSSProperties | undefined {
  if (!theme) return undefined;
  return {
    // The colour a face's ring is drawn in, so it reads as cut out of the card
    // rather than as a dark hoop laid on top of somebody's colours.
    ['--card-surface' as string]: `color-mix(in srgb, ${theme.primary} 18%, var(--popover))`,
    background: `linear-gradient(180deg, color-mix(in srgb, ${theme.primary} 18%, var(--popover)), color-mix(in srgb, ${theme.accent} 12%, var(--popover)))`,
    borderColor: `color-mix(in srgb, ${theme.primary} 55%, transparent)`,
  };
}

/**
 * The strip across the top of a profile. A banner plays whenever it is on
 * screen; without one, the profile's own colours stand in for it, and without
 * those, a quiet surface does.
 */
export function ProfileBanner({
  bannerId,
  theme,
  className,
  style,
}: {
  bannerId?: string | null;
  theme?: ProfileTheme | null;
  className?: string;
  style?: CSSProperties;
}) {
  const images = useImages();
  const [url, setUrl] = useState<string>();

  useEffect(() => {
    setUrl(undefined);
    if (!bannerId || !images) return undefined;
    let current = true;
    void images
      .url(bannerId)
      .then((value) => current && setUrl(value))
      .catch(() => undefined);
    return () => {
      current = false;
    };
  }, [bannerId, images]);

  return (
    <div
      className={cn('profile-banner relative overflow-hidden', !theme && !url && 'bg-secondary/70', className)}
      style={{ ...style, ...(url ? {} : { background: themeGradient(theme) }) }}
      data-banner={url ? 'picture' : theme ? 'theme' : 'plain'}
      aria-hidden="true"
    >
      {url && <img className="absolute inset-0 size-full object-cover" src={url} alt="" draggable={false} />}
    </div>
  );
}
