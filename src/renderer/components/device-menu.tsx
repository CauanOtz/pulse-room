import { ChevronDown } from 'lucide-react';
import type { ReactNode } from 'react';
import type { MediaDeviceOption } from '../infrastructure/media/media-devices-service';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from './ui/dropdown-menu';
import { Button } from './ui/button';

interface DeviceMenuProps {
  title: string;
  label: string;
  devices: MediaDeviceOption[];
  selectedId?: string;
  onSelect(deviceId?: string): void;
  children?: ReactNode;
}

/**
 * The list behind the caret: pick the microphone or the speakers.
 *
 * Anchoring is Radix's job, so a long list of sound cards flips above the bar
 * and scrolls inside the window instead of running off the bottom of it, and a
 * device with a long name is truncated with its full name on hover.
 */
export function DeviceMenu({ title, label, devices, selectedId, onSelect }: DeviceMenuProps) {
  const options: MediaDeviceOption[] = [{ id: '', label: 'System default' }, ...devices];
  const current = selectedId ?? '';

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          className="size-6 rounded-md px-0 text-muted-foreground hover:text-foreground"
          aria-label={label}
        >
          <ChevronDown className="size-3" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" side="top">
        <DropdownMenuLabel>{title}</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={current} onValueChange={(value) => onSelect(value || undefined)}>
          {options.map((device) => (
            <DropdownMenuRadioItem key={device.id || 'default'} value={device.id} title={device.label}>
              {device.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
