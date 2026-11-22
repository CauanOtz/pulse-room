import { cn } from './ui/utils';

/**
 * Here or away, on the corner of somebody's picture. Nothing at all when the
 * service does not say, so an older server never makes everybody look away.
 */
export function StatusDot({ online, className }: { online?: boolean; className?: string }) {
  if (online === undefined) return null;
  return (
    <span
      className={cn('status-dot', online ? 'is-online' : 'is-offline', className)}
      role="img"
      aria-label={online ? 'Online' : 'Offline'}
    />
  );
}
