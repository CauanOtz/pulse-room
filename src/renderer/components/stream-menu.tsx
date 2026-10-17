import { MonitorOff } from 'lucide-react';
import { aboveCeiling, withinCeiling, type ScreenSharePresetName } from '../domain/conference';
import {
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
} from './ui/dropdown-menu';

interface StreamMenuProps {
  sharing: boolean;
  quality: ScreenSharePresetName;
  /** The best this Pulse Room allows, if it sets a limit. */
  ceiling?: ScreenSharePresetName;
  onSelectQuality(preset: ScreenSharePresetName): void;
  onStop(): void;
}

// Cheapest first, the way a person reads a quality list.
const ladder: { preset: ScreenSharePresetName; label: string }[] = [
  { preset: 'efficient', label: '720p · 30 fps' },
  { preset: 'balanced', label: '1080p · 30 fps' },
  { preset: 'motion', label: '1080p · 60 fps' },
];

/** The caret beside the share button: stop, or change how the screen is sent. */
export function StreamMenu({ sharing, quality, ceiling, onSelectQuality, onStop }: StreamMenuProps) {
  return (
    <DropdownMenuContent align="end" side="top" className="dock-menu w-56" aria-label="Stream options">
      {sharing && (
        <>
          <DropdownMenuItem
            className="is-danger text-destructive hover:bg-destructive/10 hover:text-destructive focus:bg-destructive/10 focus:text-destructive data-[highlighted]:bg-destructive/10 data-[highlighted]:text-destructive"
            onSelect={onStop}
          >
            <MonitorOff size={15} /> Stop sharing
          </DropdownMenuItem>
          <DropdownMenuSeparator />
        </>
      )}

      <DropdownMenuLabel>Stream quality</DropdownMenuLabel>
      <DropdownMenuRadioGroup
        value={withinCeiling(quality, ceiling)}
        onValueChange={(preset) => onSelectQuality(preset as ScreenSharePresetName)}
      >
        {ladder.map((step) => (
          <DropdownMenuRadioItem
            key={step.preset}
            value={step.preset}
            disabled={aboveCeiling(step.preset, ceiling)}
          >
            {step.label}
          </DropdownMenuRadioItem>
        ))}
      </DropdownMenuRadioGroup>
      {ceiling && ceiling !== 'motion' && (
        <p className="px-2 pt-1 pb-1.5 text-[11px] text-muted-foreground">
          This Pulse Room limits shared screens to save bandwidth.
        </p>
      )}
    </DropdownMenuContent>
  );
}
