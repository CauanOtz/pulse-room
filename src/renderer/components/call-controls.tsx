import { useState } from 'react';
import { ChevronUp, Headphones, Mic, MicOff, MonitorUp, PhoneOff, Settings2 } from 'lucide-react';
import type { ScreenSharePresetName } from '../domain/conference';
import { StreamMenu } from './stream-menu';
import { cn } from './ui/utils';

interface CallControlsProps {
  microphoneEnabled: boolean;
  deafened: boolean;
  screenSharing: boolean;
  quality: ScreenSharePresetName;
  busy: boolean;
  onToggleMicrophone(): void;
  onToggleDeafen(): void;
  onShare(): void;
  onSelectQuality(preset: ScreenSharePresetName): void;
  onOpenSettings(): void;
  onLeave(): void;
}

export function CallControls(props: CallControlsProps) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div
      className="call-dock flex items-center gap-2 rounded-[26px] bg-card/90 p-2 shadow-lg backdrop-blur-sm"
      aria-label="Call controls"
    >
      <button
        className={cn('grid size-10 place-items-center rounded-full bg-secondary text-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50', !props.microphoneEnabled && 'is-danger bg-destructive text-destructive-foreground hover:bg-destructive/90')}
        type="button"
        onClick={props.onToggleMicrophone}
        aria-label={props.microphoneEnabled ? 'Mute microphone' : 'Unmute microphone'}
        title={props.microphoneEnabled ? 'Mute' : 'Unmute'}
        disabled={props.busy}
      >
        {props.microphoneEnabled ? <Mic size={19} /> : <MicOff size={19} />}
      </button>

      <button
        className={cn('grid size-10 place-items-center rounded-full bg-secondary text-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50', props.deafened && 'is-danger bg-destructive text-destructive-foreground hover:bg-destructive/90')}
        type="button"
        onClick={props.onToggleDeafen}
        aria-label="Toggle deafen"
        title="Deafen"
        disabled={props.busy}
      >
        <Headphones size={19} />
      </button>

      <span className="dock-split flex items-center">
        <button
          className={cn(
            'grid size-10 place-items-center rounded-full bg-secondary text-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50',
            'rounded-r-none',
            props.screenSharing && 'is-sharing bg-success text-background hover:bg-success/90',
          )}
          type="button"
          onClick={props.onShare}
          aria-label={props.screenSharing ? 'Stop sharing' : 'Share full screen'}
          title={props.screenSharing ? 'Stop sharing' : 'Share your screen'}
        >
          <MonitorUp size={19} />
        </button>
        <button
          className="dock-caret grid h-10 w-6 place-items-center rounded-full rounded-l-none bg-secondary text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          type="button"
          aria-label="Stream options"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen(!menuOpen)}
        >
          <ChevronUp size={12} />
        </button>
      </span>

      <button
        className="grid size-10 place-items-center rounded-full bg-secondary text-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        type="button"
        onClick={props.onOpenSettings}
        aria-label="Open audio settings"
        title="Audio settings"
      >
        <Settings2 size={19} />
      </button>

      <button
        className="leave-button grid size-10 place-items-center rounded-full bg-destructive text-destructive-foreground transition-colors hover:bg-destructive/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50"
        type="button"
        onClick={props.onLeave}
        aria-label="Leave call"
        title="Disconnect"
        disabled={props.busy}
      >
        <PhoneOff size={19} />
      </button>

      {menuOpen && (
        <StreamMenu
          sharing={props.screenSharing}
          quality={props.quality}
          onSelectQuality={props.onSelectQuality}
          onStop={props.onShare}
          onClose={() => setMenuOpen(false)}
        />
      )}
    </div>
  );
}
