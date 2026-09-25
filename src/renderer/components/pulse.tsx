import { useEffect, useRef } from 'react';
import { voiceLevels } from '../infrastructure/media/voice-levels';
import { cn } from './ui/utils';

/**
 * The one thing in this application that nothing else could draw.
 *
 * A room named for a pulse should show one. This is the live amplitude of a
 * person's voice, taken from the same measurement the audio graph already
 * makes to decide who is talking, so it is never a decorative waveform: when
 * it moves, somebody is making that sound.
 *
 * It paints straight to the element through a shared animation frame and never
 * re-renders. Under reduced motion it stops moving and simply states whether
 * the person is speaking, because a meter that twitches is exactly the kind of
 * thing that setting is asking to be spared.
 */
export function Pulse({
  participantId,
  speaking,
  className,
  bars = 3,
}: {
  participantId: string;
  /** The steady answer, used when the meter is not allowed to move. */
  speaking?: boolean;
  className?: string;
  bars?: number;
}) {
  const host = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const element = host.current;
    if (!element) return undefined;
    const still = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (still) return undefined;

    const columns = [...element.children] as HTMLElement[];
    return voiceLevels.watch(participantId, (level) => {
      // A voice covers a wide range quietly, so the meter is shaped rather
      // than linear: a murmur still shows, a shout still has somewhere to go.
      const shaped = Math.min(1, Math.sqrt(level * 7));
      for (let index = 0; index < columns.length; index += 1) {
        // The middle carries the most, so the column reads as a body of sound
        // rather than a row of identical sticks.
        const weight = 1 - Math.abs(index - (columns.length - 1) / 2) / columns.length;
        const height = 0.09 + shaped * weight * 0.91;
        columns[index].style.transform = `scaleY(${height.toFixed(3)})`;
      }
    });
  }, [participantId]);

  return (
    <span
      className={cn('pulse inline-flex h-full shrink-0 items-end gap-px', className)}
      ref={host}
      aria-hidden="true"
      data-speaking={speaking ? 'true' : undefined}
    >
      {Array.from({ length: bars }, (_, index) => (
        <span
          className={cn(
            // Resting, the bars sit on the floor as a faint rule rather than
            // hovering as a row of dots, which reads as a menu.
            'pulse-bar w-[2px] origin-bottom rounded-[1px] bg-current transition-opacity',
            'h-full scale-y-[0.09] motion-reduce:scale-y-100',
            speaking ? 'opacity-90' : 'opacity-25',
          )}
          key={index}
        />
      ))}
    </span>
  );
}
