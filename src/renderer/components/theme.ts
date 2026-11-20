export type ThemePreference = 'light' | 'dark' | 'system';

const storageKey = 'pulse-room:theme';
const dark = () => window.matchMedia?.('(prefers-color-scheme: dark)');

/** What the machine is asking for when the choice is left to it. */
export const resolveTheme = (preference: ThemePreference): 'light' | 'dark' =>
  preference === 'system' ? (dark()?.matches === false ? 'light' : 'dark') : preference;

export function readTheme(): ThemePreference {
  try {
    const stored = window.localStorage.getItem(storageKey);
    return stored === 'light' || stored === 'dark' || stored === 'system' ? stored : 'dark';
  } catch {
    return 'dark';
  }
}

export function applyTheme(preference: ThemePreference): void {
  document.documentElement.classList.toggle('theme-light', resolveTheme(preference) === 'light');
}

export function saveTheme(preference: ThemePreference): void {
  try {
    window.localStorage.setItem(storageKey, preference);
  } catch {
    // A machine that refuses storage still gets the theme for this session.
  }
}

/**
 * Saves and applies a choice, washing the new theme over the old one in a
 * circle that grows from where it was asked for.
 */
export function switchTheme(preference: ThemePreference, origin?: { x: number; y: number }): void {
  saveTheme(preference);
  const before = document.documentElement.classList.contains('theme-light');
  const after = resolveTheme(preference) === 'light';
  const still = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const transition = (document as Document & { startViewTransition?(update: () => void): unknown })
    .startViewTransition;
  if (before === after || still || !transition) {
    applyTheme(preference);
    return;
  }
  const x = origin?.x ?? window.innerWidth / 2;
  const y = origin?.y ?? window.innerHeight / 2;
  const radius = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y));
  const root = document.documentElement.style;
  root.setProperty('--reveal-x', `${x}px`);
  root.setProperty('--reveal-y', `${y}px`);
  root.setProperty('--reveal-r', `${radius}px`);
  transition.call(document, () => applyTheme(preference));
}

/**
 * Applies the stored choice before the first paint, and keeps following the
 * machine for as long as the choice is to follow it.
 */
export function installTheme(): () => void {
  const listener = () => readTheme() === 'system' && applyTheme('system');
  applyTheme(readTheme());
  dark()?.addEventListener('change', listener);
  return () => dark()?.removeEventListener('change', listener);
}
