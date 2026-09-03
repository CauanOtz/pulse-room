import { useEffect, useRef } from 'react';

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
    const element = elementRef.current;
    if (!element) return;
    element.volume = Math.min(1, Math.max(0, volume / 100));
  }, [volume]);

  useEffect(() => {
    const element = elementRef.current;
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
        muted={muted}
        aria-label={label}
      />
    );
  }

  return <audio ref={elementRef} autoPlay muted={muted} />;
}
