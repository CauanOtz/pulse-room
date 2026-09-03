import type { Participant } from '../domain/conference';
import { MediaOutput } from './media-output';

interface RoomAudioProps {
  participants: Participant[];
  speakerDeviceId?: string;
}

/** Plays every voice in the room. It has nothing to show. */
export function RoomAudio({ participants, speakerDeviceId }: RoomAudioProps) {
  return (
    <div className="room-audio" hidden>
      {participants
        .filter((participant) => !participant.isLocal && participant.microphoneStream)
        .map((participant) => (
          <MediaOutput
            key={participant.id}
            stream={participant.microphoneStream}
            speakerDeviceId={speakerDeviceId}
            volume={participant.locallyMuted ? 0 : participant.volume}
          />
        ))}
    </div>
  );
}
