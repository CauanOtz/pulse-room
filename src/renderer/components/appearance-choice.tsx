import { useState } from 'react';
import { motion } from 'motion/react';
import { Monitor, Moon, Sun } from 'lucide-react';
import { readTheme, switchTheme, type ThemePreference } from './theme';
import { cn } from './ui/utils';

const options: { value: ThemePreference; label: string; icon: typeof Sun }[] = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'system', label: 'Automatic', icon: Monitor },
  { value: 'dark', label: 'Dark', icon: Moon },
];

/** Light, dark, or whatever the machine is set to. */
export function AppearanceChoice() {
  const [preference, setPreference] = useState<ThemePreference>(readTheme);

  return (
    <div className="flex flex-col gap-2">
      <span className="text-[11px] font-medium text-muted-foreground">Appearance</span>
      <div
        className="relative flex rounded-xl border border-border bg-[rgb(var(--ink)/0.03)] p-1"
        role="radiogroup"
        aria-label="Appearance"
      >
        {options.map((option) => {
          const selected = preference === option.value;
          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={selected}
              className={cn(
                'relative flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-medium transition-colors duration-300',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                selected ? 'text-primary-foreground' : 'text-muted-foreground hover:text-foreground',
              )}
              onClick={(event) => {
                setPreference(option.value);
                switchTheme(option.value, { x: event.clientX, y: event.clientY });
              }}
            >
              {selected && (
                <motion.span
                  layoutId="appearance-thumb"
                  className="absolute inset-0 rounded-lg bg-primary"
                  transition={{ type: 'spring', stiffness: 520, damping: 38 }}
                />
              )}
              <option.icon className="relative size-3.5" />
              <span className="relative">{option.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
