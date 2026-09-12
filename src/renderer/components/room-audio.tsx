import type { Participant } from '../domain/conference';
import { MediaOutput } from './media-output';

interface RoomAudioProps {
  participants: Participant[];
  speakerDeviceId?: string;
  /** Per person, the level of the sound coming from their screen. */
  screenVolumes?: Record<string, number>;
}

/**
 * Plays everything the room can hear and shows none of it: the voices, and the
 * sound of a screen somebody is sharing.
 *
 * The sound is kept here rather than with the picture so that turning the
 * picture off does not take the music with it. Video is what costs a machine
 * anything; a stream nobody is watching is still worth listening to.
 */
export function RoomAudio({ participants, speakerDeviceId, screenVolumes }: RoomAudioProps) {
  const others = participants.filter((participant) => !participant.isLocal);
  return (
    <div className="room-audio" hidden>
      {others
        .filter((participant) => participant.microphoneStream)
        .map((participant) => (
          <MediaOutput
            key={participant.id}
            stream={participant.microphoneStream}
            speakerDeviceId={speakerDeviceId}
            volume={participant.locallyMuted ? 0 : participant.volume}
          />
        ))}
      {others
        .filter((participant) => participant.screenStream?.getAudioTracks().length)
        .map((participant) => (
          <MediaOutput
            key={`${participant.id}:screen`}
            stream={participant.screenStream}
            speakerDeviceId={speakerDeviceId}
            volume={screenVolumes?.[participant.id] ?? 50}
          />
        ))}
    </div>
  );
}
