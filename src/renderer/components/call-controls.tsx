import { useState } from 'react';
import { ChevronUp, Headphones, Mic, MicOff, MonitorUp, PhoneOff, Settings2 } from 'lucide-react';
import type { ScreenSharePresetName } from '../domain/conference';
import { StreamMenu } from './stream-menu';

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
    <div className="call-dock" aria-label="Call controls">
      <button
        className={props.microphoneEnabled ? '' : 'is-danger'}
        type="button"
        onClick={props.onToggleMicrophone}
        aria-label={props.microphoneEnabled ? 'Mute microphone' : 'Unmute microphone'}
        title={props.microphoneEnabled ? 'Mute' : 'Unmute'}
        disabled={props.busy}
      >
        {props.microphoneEnabled ? <Mic size={19} /> : <MicOff size={19} />}
      </button>

      <button
        className={props.deafened ? 'is-danger' : ''}
        type="button"
        onClick={props.onToggleDeafen}
        aria-label="Toggle deafen"
        title="Deafen"
        disabled={props.busy}
      >
        <Headphones size={19} />
      </button>

      <span className="dock-split">
        <button
          className={props.screenSharing ? 'is-sharing' : ''}
          type="button"
          onClick={props.onShare}
          aria-label={props.screenSharing ? 'Stop sharing' : 'Share full screen'}
          title={props.screenSharing ? 'Stop sharing' : 'Share your screen'}
        >
          <MonitorUp size={19} />
        </button>
        <button
          className="dock-caret"
          type="button"
          aria-label="Stream options"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen(!menuOpen)}
        >
          <ChevronUp size={12} />
        </button>
      </span>

      <button type="button" onClick={props.onOpenSettings} aria-label="Open audio settings" title="Audio settings">
        <Settings2 size={19} />
      </button>

      <button
        className="leave-button"
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
