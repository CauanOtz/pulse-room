import type { SignalQuality } from '../domain/conference';
import { Tooltip } from './ui/tooltip';
import { cn } from './ui/utils';

const wording: Record<SignalQuality, string> = {
  excellent: 'Connection is excellent',
  good: 'Connection is good',
  poor: 'Connection is poor',
  lost: 'Connection lost',
  unknown: 'Connection unknown',
};

const height = ['h-1.5', 'h-2.5', 'h-3.5'];

/**
 * Three bars for how well somebody's line is holding up.
 *
 * A good line is not news, so by default the bars are drawn only once there is
 * something to say. The foot of the window asks for them always, because that
 * is the one place where the absence of a reading would itself be a question.
 */
export function SignalBars({
  signal,
  always,
  className,
}: {
  signal?: SignalQuality;
  always?: boolean;
  className?: string;
}) {
  if (!signal || signal === 'unknown') return null;
  if (!always && (signal === 'excellent' || signal === 'good')) return null;

  const lit = signal === 'excellent' ? 3 : signal === 'good' ? 2 : signal === 'poor' ? 1 : 0;
  const troubled = signal === 'poor' || signal === 'lost';

  return (
    <Tooltip label={wording[signal]}>
      <span
        className={cn('signal-bars flex shrink-0 items-end gap-0.5', className)}
        aria-label={wording[signal]}
        data-signal={signal}
      >
        {height.map((size, index) => (
          <span
            className={cn(
              'w-0.5 rounded-full transition-colors',
              size,
              index < lit
                ? troubled
                  ? 'bg-destructive'
                  : 'bg-current'
                : troubled
                  ? 'bg-destructive/25'
                  : 'bg-current opacity-25',
            )}
            key={size}
          />
        ))}
      </span>
    </Tooltip>
  );
}
