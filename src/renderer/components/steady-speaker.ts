import { useEffect, useReducer, useState } from 'react';
import type { Participant } from '../domain/conference';

/**
 * Who the room is listening to, said steadily.
 *
 * Speaking reports switch on and off between syllables, and with several
 * people trading words a heading that followed them changed name, label and
 * width several times a second. The faces keep the raw reports; the heading
 * keeps a person for at least `dwellMs` and says they are speaking for
 * `hangoverMs` after the last word, so a pause for breath is not an exit.
 */
export function useSteadySpeaker(participants: Participant[], dwellMs = 700, hangoverMs = 900) {
  const key = participants
    .filter((person) => person.isSpeaking && !person.isMuted)
    .map((person) => person.id)
    .join('|');
  const [shown, setShown] = useState<{ id?: string; speaking: boolean; since: number }>({
    speaking: false,
    since: 0,
  });
  const [tick, wake] = useReducer((count: number) => count + 1, 0);

  useEffect(() => {
    const now = performance.now();
    const speaking = key ? key.split('|') : [];
    if (shown.id && speaking.includes(shown.id)) {
      if (!shown.speaking) setShown({ id: shown.id, speaking: true, since: now });
      return undefined;
    }
    if (speaking.length) {
      // Somebody else has the floor; the person on show leaves once their time is up.
      const wait = shown.speaking ? shown.since + dwellMs - now : 0;
      if (wait <= 0) {
        setShown({ id: speaking[0], speaking: true, since: now });
        return undefined;
      }
      const timer = setTimeout(wake, wait);
      return () => clearTimeout(timer);
    }
    if (!shown.speaking) return undefined;
    const timer = setTimeout(
      () => setShown((current) => ({ ...current, speaking: false, since: performance.now() })),
      hangoverMs,
    );
    return () => clearTimeout(timer);
  }, [key, shown, dwellMs, hangoverMs, tick]);

  const person = shown.id ? participants.find((participant) => participant.id === shown.id) : undefined;
  return {
    /** The person speaking, as the heading should say it. */
    speaker: shown.speaking && person && !person.isMuted ? person : undefined,
    /** Whoever spoke last, still in the room. */
    last: person,
  };
}
