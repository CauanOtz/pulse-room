import { useEffect, useRef } from 'react';
import { Check } from 'lucide-react';
import type { MediaDeviceOption } from '../infrastructure/media/media-devices-service';

interface DeviceMenuProps {
  title: string;
  devices: MediaDeviceOption[];
  selectedId?: string;
  onSelect(deviceId?: string): void;
  onClose(): void;
}

/** The short list behind the caret: pick the microphone or the speakers. */
export function DeviceMenu({ title, devices, selectedId, onSelect, onClose }: DeviceMenuProps) {
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  useEffect(() => cardRef.current?.focus(), []);

  const options: MediaDeviceOption[] = [{ id: '', label: 'System default' }, ...devices];

  return (
    <div className="popover-backdrop" role="presentation" onMouseDown={onClose}>
      <div
        className="device-menu"
        role="menu"
        aria-label={title}
        ref={cardRef}
        tabIndex={-1}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <p>{title}</p>
        {options.map((device) => (
          <button
            key={device.id || 'default'}
            type="button"
            role="menuitemradio"
            aria-checked={(selectedId ?? '') === device.id}
            onClick={() => {
              onSelect(device.id || undefined);
              onClose();
            }}
          >
            <span>{device.label}</span>
            {(selectedId ?? '') === device.id && <Check size={14} />}
          </button>
        ))}
      </div>
    </div>
  );
}
