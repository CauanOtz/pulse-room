/**
 * How loud each person in the room is, right now.
 *
 * The audio graph already measures this. Every eighty milliseconds it takes
 * the root-mean-square of each incoming voice to decide whether that person is
 * speaking, and then throws the number away. This keeps it.
 *
 * It is kept outside React on purpose. A level that changes twelve times a
 * second, for five people, is sixty state changes a second, and this room
 * spends its evenings sitting behind a game. Painters register a function that
 * writes straight to an element, one shared animation frame drives all of
 * them, and the loop stops entirely when nobody is drawing or nothing is
 * moving. Nothing here ever re-renders anything.
 */

type Painter = (level: number) => void;

interface Watcher {
  id: string;
  paint: Painter;
  /** What is currently drawn, which eases toward what was measured. */
  shown: number;
}

/**
 * A meter that jumps up and falls back, which is how a voice reads. Rising is
 * nearly immediate because the start of a word is the informative part;
 * falling is slower so a syllable gap does not look like silence.
 */
const rise = 0.55;
const fall = 0.12;
/** Below this, treat it as still and let the loop go back to sleep. */
const asleep = 0.002;

export class VoiceLevels {
  private readonly levels = new Map<string, number>();
  private readonly watchers = new Set<Watcher>();
  private frame?: number;

  /** Called by the audio graph each time it measures somebody. */
  public report(id: string, level: number): void {
    this.levels.set(id, level);
    this.wake();
  }

  public forget(id: string): void {
    this.levels.delete(id);
    this.wake();
  }

  public clear(): void {
    this.levels.clear();
    this.wake();
  }

  public get(id: string): number {
    return this.levels.get(id) ?? 0;
  }

  /**
   * Draw this person until the returned function is called. The painter is
   * handed a value between zero and one, already eased.
   */
  public watch(id: string, paint: Painter): () => void {
    const watcher: Watcher = { id, paint, shown: 0 };
    this.watchers.add(watcher);
    this.wake();
    return () => {
      this.watchers.delete(watcher);
      if (this.watchers.size === 0 && this.frame !== undefined) {
        cancelAnimationFrame(this.frame);
        this.frame = undefined;
      }
    };
  }

  private wake(): void {
    if (this.frame !== undefined || this.watchers.size === 0) return;
    if (typeof requestAnimationFrame !== 'function') return;
    this.frame = requestAnimationFrame(this.tick);
  }

  private readonly tick = (): void => {
    this.frame = undefined;
    let moving = false;

    for (const watcher of this.watchers) {
      const target = this.levels.get(watcher.id) ?? 0;
      const distance = target - watcher.shown;
      // Eased, not invented: between two measurements the meter travels
      // towards the last one rather than drawing a shape nobody made.
      watcher.shown += distance * (distance > 0 ? rise : fall);
      if (Math.abs(distance) > asleep || watcher.shown > asleep) moving = true;
      watcher.paint(watcher.shown);
    }

    // A silent room costs nothing: with everybody at rest the loop stops and
    // only starts again when somebody speaks.
    if (moving) this.wake();
  };
}

export const voiceLevels = new VoiceLevels();
