import { useState } from 'react';
import { Monitor, Moon, Sun } from 'lucide-react';
import { applyTheme, readTheme, saveTheme, type ThemePreference } from './theme';
import { cn } from './ui/utils';

const options: { value: ThemePreference; label: string; icon: typeof Sun }[] = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'system', label: 'Automatic', icon: Monitor },
  { value: 'dark', label: 'Dark', icon: Moon },
];

/** Light, dark, or whatever the machine is set to. */
export function AppearanceChoice() {
  const [preference, setPreference] = useState<ThemePreference>(readTheme);

  const choose = (next: ThemePreference) => {
    setPreference(next);
    saveTheme(next);
    applyTheme(next);
  };

  return (
    <div className="flex flex-col gap-2">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        Appearance
      </span>
      <div className="flex rounded-lg border border-border p-0.5" role="radiogroup" aria-label="Appearance">
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={preference === option.value}
            className={cn(
              'flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              preference === option.value
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:bg-accent hover:text-foreground',
            )}
            onClick={() => choose(option.value)}
          >
            <option.icon className="size-3.5" />
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}
