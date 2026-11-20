import { Eye, Maximize2, MonitorUp, Play, Radio } from 'lucide-react';
import type { Participant } from '../domain/conference';
import { Avatar } from './avatar';
import { MediaOutput } from './media-output';

/** A live offer is visible before subscribing; only a received screen draws video. */
export function BroadcastCard({
  participant,
  wanted,
  avatarId,
  onFocus,
  onOptions,
}: {
  participant: Participant;
  wanted: boolean;
  avatarId?: string | null;
  onFocus(participant: Participant): void;
  onOptions?(participant: Participant, position: { x: number; y: number }): void;
}) {
  const picture =
    wanted && participant.screenStream?.getVideoTracks().length ? participant.screenStream : undefined;
  const receiving = Boolean(picture) && !participant.isLocal;
  return (
    <button
      type="button"
      className={`broadcast-card ${picture ? 'has-preview' : 'is-offer'}`}
      aria-label={receiving ? `Show ${participant.name}` : `Watch ${participant.name}`}
      onClick={() => onFocus(participant)}
      onContextMenu={(event) => {
        if (!onOptions || participant.isLocal) return;
        event.preventDefault();
        onOptions(participant, { x: event.clientX, y: event.clientY });
      }}
    >
      <span className="broadcast-preview">
        {picture ? (
          <MediaOutput
            stream={picture}
            muted
            video
            className="tile-video broadcast-video"
            label={`${participant.name} screen preview`}
          />
        ) : (
          <span className="broadcast-placeholder">
            <Avatar
              name={participant.name}
              initials={participant.initials}
              imageId={avatarId}
              className="broadcast-placeholder-avatar"
            />
            <span>{wanted ? 'Connecting to stream…' : 'A screen is being shared'}</span>
          </span>
        )}
        <span className="broadcast-flags">
          <span className="tile-live broadcast-live">
            <Radio size={12} aria-hidden="true" />
            Live
          </span>
          {receiving && (
            <span className="tile-taken broadcast-watching">
              <Eye size={12} aria-hidden="true" />
              Watching
            </span>
          )}
        </span>
        <span className="broadcast-expand" aria-hidden="true">
          <Maximize2 size={15} />
        </span>
      </span>
      <span className="broadcast-footer">
        <Avatar
          name={participant.name}
          initials={participant.initials}
          imageId={avatarId}
          className="broadcast-owner-avatar"
        />
        <span className="broadcast-owner">
          <strong title={participant.name}>
            {participant.name}
            {participant.isLocal ? ' (you)' : ''}
          </strong>
          <small>
            <MonitorUp size={12} aria-hidden="true" />
            {participant.isLocal ? 'Your screen' : 'Screen sharing'}
          </small>
        </span>
        <span className="broadcast-cta">
          {picture ? <Maximize2 size={14} aria-hidden="true" /> : <Play size={14} aria-hidden="true" />}
          <span>{picture ? 'Open stream' : wanted ? 'Connecting…' : 'Watch stream'}</span>
        </span>
      </span>
    </button>
  );
}
