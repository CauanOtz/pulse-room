import { useEffect, useRef, useState } from 'react';

/** Measures an existing voice track. It never opens a device or plays audio. */
export function VoiceWaveform({ stream, name }: { stream: MediaStream; name: string }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [available, setAvailable] = useState(true);

  useEffect(() => {
    if (!stream.getAudioTracks().length) {
      setAvailable(false);
      return;
    }
    setAvailable(true);
    let context: AudioContext | undefined;
    let source: MediaStreamAudioSourceNode | undefined;
    let timer: ReturnType<typeof setInterval> | undefined;
    try {
      context = new AudioContext();
      const analyser = context.createAnalyser();
      analyser.fftSize = 512;
      source = context.createMediaStreamSource(stream);
      source.connect(analyser);
      void context.resume().catch(() => setAvailable(false));
      const samples = new Float32Array(analyser.fftSize);
      const paint = () => {
        const element = canvas.current;
        const drawing = element?.getContext('2d');
        if (!element || !drawing) return;
        analyser.getFloatTimeDomainData(samples);
        drawing.clearRect(0, 0, element.width, element.height);
        drawing.strokeStyle = getComputedStyle(element).color;
        drawing.lineWidth = 3;
        drawing.lineCap = 'round';
        for (let bar = 0; bar < 24; bar += 1) {
          const from = Math.floor((bar / 24) * samples.length);
          const until = Math.floor(((bar + 1) / 24) * samples.length);
          let peak = 0;
          for (let index = from; index < until; index += 1) peak = Math.max(peak, Math.abs(samples[index]));
          const height = Math.max(2, Math.min(58, peak * 160));
          const x = 5 + bar * 12;
          drawing.beginPath();
          drawing.moveTo(x, 32 - height / 2);
          drawing.lineTo(x, 32 + height / 2);
          drawing.stroke();
        }
      };
      paint();
      timer = setInterval(paint, window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 250 : 80);
    } catch {
      setAvailable(false);
    }
    return () => {
      clearInterval(timer);
      source?.disconnect();
      if (context && context.state !== 'closed') void context.close();
    };
  }, [stream]);

  if (!available) return null;
  return (
    <canvas
      ref={canvas}
      className="voice-waveform"
      width={292}
      height={64}
      role="img"
      aria-label={`Audio activity for ${name}`}
    />
  );
}
