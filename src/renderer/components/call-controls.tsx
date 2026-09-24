import { ChevronUp, Headphones, Mic, MicOff, MonitorUp, PhoneOff, Settings2 } from 'lucide-react';
import type { ScreenSharePresetName } from '../domain/conference';
import { StreamMenu } from './stream-menu';
import { DropdownMenu, DropdownMenuTrigger } from './ui/dropdown-menu';
import { Tooltip } from './ui/tooltip';
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
  return (
    <div
      // A blurred backdrop is recomputed by the GPU on every frame of whatever
      // is behind it, and what is behind this is somebody's game at sixty
      // frames a second. An opaque panel costs nothing and reads the same.
      className="call-dock flex items-center gap-1.5 rounded-xl border border-border bg-popover p-1.5 shadow-lg shadow-black/30"
      aria-label="Call controls"
    >
      <Tooltip label={props.microphoneEnabled ? 'Mute' : 'Unmute'}>
        <button
          className={cn('grid size-9 place-items-center rounded-lg bg-secondary text-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50', !props.microphoneEnabled && 'is-danger bg-destructive text-destructive-foreground hover:bg-destructive/90')}
          type="button"
          onClick={props.onToggleMicrophone}
          aria-label={props.microphoneEnabled ? 'Mute microphone' : 'Unmute microphone'}
          disabled={props.busy}
        >
          {props.microphoneEnabled ? <Mic size={17} /> : <MicOff size={17} />}
        </button>
      </Tooltip>

      <Tooltip label={props.deafened ? 'Undeafen' : 'Deafen'}>
        <button
          className={cn('grid size-9 place-items-center rounded-lg bg-secondary text-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50', props.deafened && 'is-danger bg-destructive text-destructive-foreground hover:bg-destructive/90')}
          type="button"
          onClick={props.onToggleDeafen}
          aria-label="Toggle deafen"
          disabled={props.busy}
        >
          <Headphones size={17} />
        </button>
      </Tooltip>

      <span className="dock-split flex items-center">
        <Tooltip label={props.screenSharing ? 'Stop sharing' : 'Share your screen'}>
          <button
            className={cn(
              'grid size-9 place-items-center rounded-lg bg-secondary text-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50',
              'rounded-r-none',
              props.screenSharing && 'is-sharing bg-success text-background hover:bg-success/90',
            )}
            type="button"
            onClick={props.onShare}
            aria-label={props.screenSharing ? 'Stop sharing' : 'Share full screen'}
          >
            <MonitorUp size={17} />
          </button>
        </Tooltip>
        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild>
            <button
              className="dock-caret grid h-9 w-5 place-items-center rounded-lg rounded-l-none bg-secondary text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              type="button"
              aria-label="Stream options"
            >
              <ChevronUp size={12} />
            </button>
          </DropdownMenuTrigger>
          <StreamMenu
            sharing={props.screenSharing}
            quality={props.quality}
            onSelectQuality={props.onSelectQuality}
            onStop={props.onShare}
          />
        </DropdownMenu>
      </span>

      <Tooltip label="Audio settings">
        <button
          className="grid size-9 place-items-center rounded-lg bg-secondary text-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          type="button"
          onClick={props.onOpenSettings}
          aria-label="Open audio settings"
        >
          <Settings2 size={17} />
        </button>
      </Tooltip>

      <Tooltip label="Disconnect">
        <button
          className="leave-button grid size-9 place-items-center rounded-lg bg-destructive text-destructive-foreground transition-colors hover:bg-destructive/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50"
          type="button"
          onClick={props.onLeave}
          aria-label="Leave call"
          disabled={props.busy}
        >
          <PhoneOff size={17} />
        </button>
      </Tooltip>
    </div>
  );
}
