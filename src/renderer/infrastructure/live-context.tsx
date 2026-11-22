import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { typingHoldMs } from '../../shared/live';
import type { LiveConnection, LiveSignal } from './live-connection';

const LiveContext = createContext<LiveConnection | undefined>(undefined);
export const LiveProvider = LiveContext.Provider;

/** The application's live connection, absent before sign-in and in tests. */
export function useLive(): LiveConnection | undefined {
  return useContext(LiveContext);
}

/** Runs `handler` for every live signal, always the latest one passed. */
export function useLiveSignals(handler: (signal: LiveSignal) => void): void {
  const live = useLive();
  const latest = useRef(handler);
  latest.current = handler;
  useEffect(() => live?.listen((signal) => latest.current(signal)), [live]);
}

/** How long to wait between reads: rarely while events arrive, often when they cannot. */
export const paced =
  (live: LiveConnection | undefined, fastMs: number, slowMs = 30_000) =>
  (): number =>
    live?.live ? slowMs : fastMs;

export interface Poller {
  /** Reads now; a read already running is followed by one more. */
  kick(): void;
  stop(): void;
}

/**
 * Reads on a timer and whenever it is kicked, one read at a time.
 *
 * `read` handles its own failures; the timer goes on regardless, and the wait
 * is asked again each time so it follows the connection as it comes and goes.
 */
export function poll(read: (signal: AbortSignal) => Promise<void>, wait: () => number): Poller {
  const abort = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let running = false;
  let again = false;
  const run = async () => {
    clearTimeout(timer);
    if (abort.signal.aborted) return;
    if (running) {
      again = true;
      return;
    }
    running = true;
    try {
      await read(abort.signal);
    } catch {
      // The read reports its own trouble.
    } finally {
      running = false;
      if (!abort.signal.aborted) {
        if (again) {
          again = false;
          void run();
        } else timer = setTimeout(() => void run(), wait());
      }
    }
  };
  void run();
  return {
    kick: () => void run(),
    stop: () => {
      abort.abort();
      clearTimeout(timer);
    },
  };
}

export interface Typist {
  userId: string;
  name: string;
}

/**
 * The people typing in one place, each kept for a few seconds after their
 * last signal and dropped at once when a message of theirs arrives.
 */
export function useTypists(place: { channelId?: string; conversationId?: string }): Typist[] {
  const [typists, setTypists] = useState<(Typist & { until: number })[]>([]);
  const { channelId, conversationId } = place;
  useEffect(() => setTypists([]), [channelId, conversationId]);
  useLiveSignals((signal) => {
    const here =
      (channelId && 'channelId' in signal && signal.channelId === channelId) ||
      (conversationId && 'conversationId' in signal && signal.conversationId === conversationId);
    if (signal.type === 'sync') setTypists([]);
    if (!here) return;
    if (signal.type === 'typing') {
      const until = Date.now() + typingHoldMs;
      setTypists((current) => [
        ...current.filter((typist) => typist.userId !== signal.userId),
        { userId: signal.userId, name: signal.name, until },
      ]);
    } else if ((signal.type === 'channel' || signal.type === 'directs') && signal.authorId)
      setTypists((current) => current.filter((typist) => typist.userId !== signal.authorId));
  });
  useEffect(() => {
    if (!typists.length) return undefined;
    const soonest = Math.min(...typists.map((typist) => typist.until));
    const timer = setTimeout(
      () => setTypists((current) => current.filter((typist) => typist.until > Date.now())),
      Math.max(0, soonest - Date.now()) + 50,
    );
    return () => clearTimeout(timer);
  }, [typists]);
  return typists;
}

/** "Ana is typing", "Ana and Bo are typing", "Several people are typing". */
export function typingLine(typists: Typist[]): string {
  if (!typists.length) return '';
  if (typists.length === 1) return `${typists[0].name} is typing`;
  if (typists.length === 2) return `${typists[0].name} and ${typists[1].name} are typing`;
  return 'Several people are typing';
}
