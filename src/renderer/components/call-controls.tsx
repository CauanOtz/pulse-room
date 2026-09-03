import { MonitorUp, PhoneOff, Settings2 } from 'lucide-react';

interface CallControlsProps {
  screenSharing: boolean;
  busy: boolean;
  onLeave(): void;
  onShare(): void;
  onOpenSettings(): void;
}

export function CallControls(props: CallControlsProps) {
  return (
    <div className="call-dock" aria-label="Call controls">
      <button
        className={props.screenSharing ? 'is-sharing' : 'share-button'}
        type="button"
        onClick={props.onShare}
        aria-label={props.screenSharing ? 'Stop sharing' : 'Share full screen'}
        title={props.screenSharing ? 'Stop sharing' : 'Share full screen'}
      >
        <MonitorUp size={19} />
      </button>
      <button type="button" onClick={props.onOpenSettings} aria-label="Open audio settings" title="Audio settings">
        <Settings2 size={19} />
      </button>
      <button className="leave-button" type="button" onClick={props.onLeave} aria-label="Leave call" title="Leave call" disabled={props.busy}>
        <PhoneOff size={19} />
      </button>
    </div>
  );
}
