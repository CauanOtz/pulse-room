import { useEffect, useRef, useState } from 'react';
import { audioPlayback, type PlaybackHandle } from '../infrastructure/media/audio-playback-engine';

interface MediaOutputProps {
  stream?: MediaStream;
  muted?: boolean;
  speakerDeviceId?: string;
  video?: boolean;
  className?: string;
  volume?: number;
  label?: string;
}

export function MediaOutput({
  stream,
  muted,
  speakerDeviceId,
  video,
  className,
  volume = 100,
  label = 'Shared screen',
}: MediaOutputProps) {
  const elementRef = useRef<HTMLVideoElement & HTMLAudioElement>(null);
  const playbackRef = useRef<PlaybackHandle>(undefined);
  const [boosted, setBoosted] = useState(false);

  // Each concern gets its own effect: reassigning srcObject restarts playback,
  // so a volume change must never touch the stream.
  useEffect(() => {
    const element = elementRef.current;
    if (!element || element.srcObject === (stream ?? null)) return;
    element.srcObject = stream ?? null;
    // Environments without a media stack return nothing from play().
    void Promise.resolve(element.play()).catch(() => undefined);
  }, [stream]);

  useEffect(() => {
    if (!stream || muted) return undefined;

    const handle = audioPlayback.attach(stream);
    playbackRef.current = handle;
    setBoosted(Boolean(handle));

    return () => {
      handle?.dispose();
      playbackRef.current = undefined;
      setBoosted(false);
    };
  }, [muted, stream]);

  useEffect(() => {
    const element = elementRef.current;
    playbackRef.current?.setVolume(volume);
    // The element keeps the picture; sound it can only attenuate, never boost.
    if (element && !playbackRef.current) element.volume = Math.min(1, Math.max(0, volume / 100));
  }, [boosted, volume]);

  useEffect(() => {
    const element = elementRef.current;
    void audioPlayback.useOutputDevice(speakerDeviceId);
    if (!element || !speakerDeviceId || !('setSinkId' in element)) return;
    void element.setSinkId(speakerDeviceId).catch(() => undefined);
  }, [speakerDeviceId]);

  if (video) {
    return (
      <video
        ref={elementRef}
        className={className}
        autoPlay
        playsInline
        muted={muted || boosted}
        aria-label={label}
      />
    );
  }

  return <audio ref={elementRef} autoPlay muted={muted || boosted} />;
}
