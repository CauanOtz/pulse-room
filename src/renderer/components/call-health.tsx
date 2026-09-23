import { useEffect, useState } from 'react';
import type { ParticipantHealth } from '../domain/conference';
import { cn } from './ui/utils';

/**
 * What it is costing this machine to keep everybody else audible.
 *
 * A voice that sounds like wind or static is almost never a microphone. It is
 * the receiver inventing audio to cover packets that were late or never came,
 * and that invention is counted. Without this, a room can only trade opinions
 * about whose headphones are broken.
 *
 * Anything under about half a per cent is a call nobody would remark on. Past
 * a few per cent it is audible, and the line it belongs to is named here.
 */
export function CallHealth({ read }: { read(): Promise<ParticipantHealth[]> }) {
  const [people, setPeople] = useState<ParticipantHealth[]>([]);

  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      const next = await read().catch(() => []);
      if (stopped) return;
      setPeople(next);
      timer = setTimeout(() => void poll(), 2000);
    };
    void poll();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [read]);

  if (people.length === 0) return null;

  return (
    <fieldset className="health-field field-span col-span-2 flex flex-col gap-2 rounded-xl border border-border bg-background/60 p-3">
      <legend className="px-1 text-xs font-semibold text-muted-foreground">Call health</legend>
      <p className="px-1 pb-1 text-[11px] text-muted-foreground">
        How much of each voice this machine had to invent because it did not arrive in time.
        Wind, static and warbling are this number, not a microphone. Under 0.5% is a call
        nobody notices.
      </p>
      <ul className="flex flex-col gap-1">
        {people.map((person) => {
          const concealed = person.concealedPercent;
          const rough = concealed !== undefined && concealed >= 1;
          return (
            <li
              className="flex items-baseline gap-3 rounded-lg px-2 py-1.5 text-xs odd:bg-secondary/40"
              key={person.id}
            >
              <span className="min-w-0 flex-1 truncate font-medium text-foreground">{person.name}</span>
              <span
                className={cn(
                  'font-mono tabular-nums',
                  rough ? 'font-semibold text-destructive' : 'text-muted-foreground',
                )}
              >
                {concealed === undefined ? '—' : `${concealed.toFixed(2)}% invented`}
              </span>
              <span className="hidden font-mono tabular-nums text-muted-foreground sm:inline">
                {person.jitterMs === undefined ? '' : `${person.jitterMs.toFixed(0)} ms jitter`}
              </span>
              <span className="font-mono tabular-nums text-muted-foreground">
                {person.jitterBufferMs === undefined ? '' : `${person.jitterBufferMs.toFixed(0)} ms held`}
              </span>
            </li>
          );
        })}
      </ul>
    </fieldset>
  );
}
