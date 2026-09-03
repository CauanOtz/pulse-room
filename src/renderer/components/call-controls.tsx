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
      >
        <MonitorUp size={20} /><span>{props.screenSharing ? 'Stop share' : 'Share screen'}</span>
      </button>
      <button type="button" onClick={props.onOpenSettings} aria-label="Open settings">
        <Settings2 size={20} /><span>Audio</span>
      </button>
      <span className="dock-rule" />
      <button className="leave-button" type="button" onClick={props.onLeave} aria-label="Leave call" disabled={props.busy}>
        <PhoneOff size={20} /><span>Leave</span>
      </button>
    </div>
  );
}
