import type { Participant } from '../domain/conference';
import { MediaOutput } from './media-output';

interface RoomAudioProps {
  participants: Participant[];
  speakerDeviceId?: string;
  /** Whose screens are being watched. Only those are heard. */
  watching?: string[];
  /** Per person, the level of the sound coming from their screen. */
  screenVolumes?: Record<string, number>;
  onSpeakingChange?(participantId: string, speaking: boolean): void;
}

/**
 * Plays everything the room can hear and shows none of it: the voices, and the
 * sound of the one screen being watched.
 *
 * Leaving a stream leaves it entirely. The sound lives here rather than inside
 * the picture so that it has one owner and can never play twice, not so that it
 * outlives the watching.
 */
export function RoomAudio({
  participants,
  speakerDeviceId,
  watching,
  screenVolumes,
  onSpeakingChange,
}: RoomAudioProps) {
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
            onSpeakingChange={(speaking) => onSpeakingChange?.(participant.id, speaking)}
          />
        ))}
      {others
        .filter(
          (participant) =>
            watching?.includes(participant.id) && participant.screenStream?.getAudioTracks().length,
        )
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
