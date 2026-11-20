import { Eye, MicOff, MonitorUp, Play, X } from 'lucide-react';
import type { Participant } from '../domain/conference';
import { accountOf } from '../domain/roster';
import { Avatar } from './avatar';
import { MediaOutput } from './media-output';

interface PeopleProps {
  participants: Participant[];
  avatars?: ReadonlyMap<string, string | null | undefined>;
  onOptions?(participant: Participant, position: { x: number; y: number }): void;
}

export function LiveStreamNavigation({
  participants,
  avatars,
  watching,
  activeId,
  onSelect,
  onStop,
  onOptions,
}: PeopleProps & {
  watching: string[];
  activeId: string;
  onSelect(participant: Participant): void;
  onStop(participantId: string): void;
}) {
  return (
    <aside className="live-stream-navigation" aria-label="Live streams">
      <header>
        <strong>Streams</strong>
        <span>{participants.length} live</span>
      </header>
      <div className="live-stream-list">
        {participants.map((person) => {
          const current = person.id === activeId;
          const wanted = person.isLocal || watching.includes(person.id);
          const picture =
            wanted && person.screenStream?.getVideoTracks().length ? person.screenStream : undefined;
          const status = current
            ? 'On screen'
            : wanted
              ? picture
                ? 'Watching'
                : 'Connecting…'
              : 'Not watching';
          return (
            <div className={`live-stream-entry ${current ? 'is-current' : ''}`} key={person.id}>
              <button
                className="live-stream-select"
                type="button"
                aria-label={
                  current
                    ? `Current stream ${person.name}`
                    : wanted
                      ? `Show ${person.name}`
                      : `Watch ${person.name}`
                }
                aria-pressed={current}
                onClick={() => {
                  if (!current) onSelect(person);
                }}
                onContextMenu={(event) => {
                  if (!onOptions || person.isLocal) return;
                  event.preventDefault();
                  onOptions(person, { x: event.clientX, y: event.clientY });
                }}
              >
                {!current && picture && (
                  <span className="live-switch-preview">
                    <MediaOutput
                      stream={picture}
                      muted
                      video
                      className="tile-video"
                      label={`${person.name} screen preview`}
                    />
                  </span>
                )}
                <span className="live-switch-identity">
                  <Avatar
                    name={person.name}
                    initials={person.initials}
                    imageId={avatars?.get(accountOf(person.id))}
                    className="live-switch-avatar"
                  />
                  <span className="live-switch-name">
                    <strong title={person.name}>
                      {person.name}
                      {person.isLocal ? ' (you)' : ''}
                    </strong>
                    <small>
                      {current ? <MonitorUp size={11} /> : wanted ? <Eye size={11} /> : <Play size={11} />}
                      {status}
                    </small>
                  </span>
                </span>
              </button>
              {wanted && !current && !person.isLocal && (
                <button
                  className="live-stream-stop"
                  type="button"
                  aria-label={`Stop watching ${person.name}`}
                  onClick={() => onStop(person.id)}
                >
                  <X size={14} />
                </button>
              )}
            </div>
          );
        })}
      </div>
      <p>Switch views freely. Stop watching to leave a stream.</p>
    </aside>
  );
}

export function LiveVoicePeers({ participants, avatars, onOptions }: PeopleProps) {
  if (!participants.length) return null;
  return (
    <div className="live-voice-peers" aria-label="People in voice">
      {participants.map((person) => (
        <div
          key={person.id}
          className={`live-voice-peer ${person.isSpeaking && !person.isMuted ? 'is-speaking' : ''}`}
          onContextMenu={(event) => {
            if (!onOptions || person.isLocal) return;
            event.preventDefault();
            onOptions(person, { x: event.clientX, y: event.clientY });
          }}
        >
          <Avatar
            name={person.name}
            initials={person.initials}
            imageId={avatars?.get(accountOf(person.id))}
            className="live-peer-avatar"
          />
          <span title={person.name}>
            {person.name}
            {person.isLocal ? ' (you)' : ''}
          </span>
          {person.isMuted && <MicOff size={12} aria-label="Microphone muted" />}
        </div>
      ))}
    </div>
  );
}
