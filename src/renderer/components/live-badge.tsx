import { Tv } from 'lucide-react';
import type { RosterEntry } from '../domain/roster';
import { Tooltip } from './ui/tooltip';
import { cn } from './ui/utils';

/**
 * Says that somebody is sharing, and whether this machine took it. The picture
 * and the choice live on the person in the room; a list that also carried them
 * would be two places to look for the same thing.
 */
export function LiveBadge({ entry, watching }: { entry: RosterEntry; watching?: string[] }) {
  // Your own screen is never something you are watching: it is something you
  // are sending, and the room should not tell you that you tuned into it.
  const taken = !entry.isLocal && watching?.includes(entry.id);
  const hint = entry.isLocal
    ? 'You are sharing your screen'
    : taken
      ? `You are watching ${entry.name}`
      : `${entry.name} is sharing a screen`;
  return (
    <Tooltip label={hint}>
      <span
        className={cn(
          'roster-live inline-flex shrink-0 items-center gap-1 rounded-xs px-1 py-px text-[8.5px] font-bold uppercase tracking-[0.12em]',
          taken ? 'bg-secondary text-muted-foreground' : 'bg-destructive text-destructive-foreground',
        )}
        aria-label={hint}
      >
        {taken ? (
          <Tv aria-hidden="true" className="size-2.5" />
        ) : (
          <span className="size-1 rounded-full bg-current" />
        )}
        Live
      </span>
    </Tooltip>
  );
}
