import { useEffect, useState } from 'react';
import { formatElapsed } from '../domain/roster';

/** One clock for every timer on screen, so they all turn over together. */
const listeners = new Set<() => void>();
let ticker: ReturnType<typeof setInterval> | undefined;
function subscribe(listener: () => void) {
  listeners.add(listener);
  ticker ??= setInterval(() => listeners.forEach((each) => each()), 1_000);
  return () => {
    listeners.delete(listener);
    if (!listeners.size && ticker) {
      clearInterval(ticker);
      ticker = undefined;
    }
  };
}

/** How long a call has been going, counting up each second. */
export function CallTimer({ since, className }: { since: number; className?: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => subscribe(() => setNow(Date.now())), []);
  const elapsed = formatElapsed(now - since);
  return (
    <time
      className={className ?? 'call-timer'}
      dateTime={new Date(since).toISOString()}
      title={`In call since ${new Date(since).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`}
      aria-label={`In call for ${elapsed}`}
    >
      {elapsed}
    </time>
  );
}
