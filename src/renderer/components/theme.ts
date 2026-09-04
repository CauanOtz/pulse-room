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
 * Applies the stored choice before the first paint, and keeps following the
 * machine for as long as the choice is to follow it.
 */
export function installTheme(): () => void {
  const listener = () => readTheme() === 'system' && applyTheme('system');
  applyTheme(readTheme());
  dark()?.addEventListener('change', listener);
  return () => dark()?.removeEventListener('change', listener);
}
