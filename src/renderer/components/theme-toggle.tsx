import { useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';
import { Button } from './ui/button';

export type Theme = 'dark' | 'light';
const storageKey = 'pulse-room:theme';

const apply = (theme: Theme) => document.documentElement.classList.toggle('theme-light', theme === 'light');

export function readTheme(): Theme {
  try {
    return window.localStorage.getItem(storageKey) === 'light' ? 'light' : 'dark';
  } catch {
    return 'dark';
  }
}

/** Applies the stored choice before the first paint of the application. */
export function installTheme(): void {
  apply(readTheme());
}

export function ThemeToggle({ className }: { className?: string }) {
  const [theme, setTheme] = useState<Theme>(readTheme);

  useEffect(() => {
    apply(theme);
    try {
      window.localStorage.setItem(storageKey, theme);
    } catch {
      // A machine that refuses storage still gets the theme for this session.
    }
  }, [theme]);

  const next = theme === 'dark' ? 'light' : 'dark';
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      className={className}
      aria-label={next === 'light' ? 'Switch to the light theme' : 'Switch to the dark theme'}
      onClick={() => setTheme(next)}
    >
      {theme === 'dark' ? <Sun className="size-4" /> : <Moon className="size-4" />}
    </Button>
  );
}
