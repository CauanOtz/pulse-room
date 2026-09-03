import { useEffect, useRef } from 'react';

interface MediaOutputProps {
  stream?: MediaStream;
  muted?: boolean;
  speakerDeviceId?: string;
  video?: boolean;
  className?: string;
  volume?: number;
}

export function MediaOutput({ stream, muted, speakerDeviceId, video, className, volume = 100 }: MediaOutputProps) {
  const elementRef = useRef<HTMLVideoElement & HTMLAudioElement>(null);

  useEffect(() => {
    const element = elementRef.current;
    if (!element) return;
    element.srcObject = stream ?? null;
    element.volume = Math.min(1, Math.max(0, volume / 100));
    if (speakerDeviceId && 'setSinkId' in element) {
      void element.setSinkId(speakerDeviceId).catch(() => undefined);
    }
    void element.play().catch(() => undefined);
  }, [speakerDeviceId, stream, volume]);

  if (video) {
    return (
      <video
        ref={elementRef}
        className={className}
        autoPlay
        playsInline
        muted={muted}
        aria-label="Shared screen"
      />
    );
  }

  return <audio ref={elementRef} autoPlay muted={muted} />;
}
