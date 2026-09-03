import { Headphones, Mic, MicOff, MonitorUp, PhoneOff, Settings2 } from 'lucide-react';

interface CallControlsProps {
  joined: boolean;
  microphoneEnabled: boolean;
  deafened: boolean;
  screenSharing: boolean;
  busy: boolean;
  onJoin(): void;
  onLeave(): void;
  onToggleMicrophone(): void;
  onToggleDeafen(): void;
  onShare(): void;
  onOpenSettings(): void;
}

export function CallControls(props: CallControlsProps) {
  if (!props.joined) {
    return (
      <div className="join-dock">
        <div>
          <strong>Join Lounge</strong>
          <span>Microphone processing is enabled</span>
        </div>
        <button type="button" onClick={props.onJoin} disabled={props.busy}>
          {props.busy ? 'Connecting…' : 'Join voice'}
        </button>
      </div>
    );
  }

  return (
    <div className="call-dock" aria-label="Call controls">
      <button
        className={props.microphoneEnabled ? '' : 'is-danger'}
        type="button"
        onClick={props.onToggleMicrophone}
        aria-label={props.microphoneEnabled ? 'Mute microphone' : 'Unmute microphone'}
      >
        {props.microphoneEnabled ? <Mic size={20} /> : <MicOff size={20} />}
        <span>{props.microphoneEnabled ? 'Mute' : 'Unmute'}</span>
      </button>
      <button
        className={props.deafened ? 'is-danger' : ''}
        type="button"
        onClick={props.onToggleDeafen}
        aria-label="Toggle deafen"
      >
        <Headphones size={20} /><span>Deafen</span>
      </button>
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
      <button className="leave-button" type="button" onClick={props.onLeave} aria-label="Leave call">
        <PhoneOff size={20} /><span>Leave</span>
      </button>
    </div>
  );
}
