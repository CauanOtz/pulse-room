import { useEffect, useState } from 'react';

interface MicrophoneMeterProps {
  deviceId?: string;
  gateThresholdDb: number;
}

const floorDb = -80;

/**
 * Opens the chosen microphone while the dialog is on screen so the speaker can
 * see the level move, and where the noise gate will cut, before trusting it.
 */
export function MicrophoneMeter({ deviceId, gateThresholdDb }: MicrophoneMeterProps) {
  const [levelDb, setLevelDb] = useState(floorDb);
  const [failure, setFailure] = useState<string>();

  useEffect(() => {
    let stopped = false;
    let frame = 0;
    let stream: MediaStream | undefined;
    let context: AudioContext | undefined;

    const start = async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: deviceId ? { deviceId: { ideal: deviceId } } : true,
        });
        if (stopped) return;

        context = new AudioContext();
        const analyser = context.createAnalyser();
        analyser.fftSize = 1024;
        context.createMediaStreamSource(stream).connect(analyser);

        const samples = new Float32Array(analyser.fftSize);
        const measure = () => {
          if (stopped) return;
          analyser.getFloatTimeDomainData(samples);
          let total = 0;
          for (const sample of samples) total += sample * sample;
          const rms = Math.sqrt(total / samples.length);
          setLevelDb(rms > 0 ? Math.max(floorDb, 20 * Math.log10(rms)) : floorDb);
          frame = requestAnimationFrame(measure);
        };
        measure();
      } catch {
        if (!stopped) setFailure('This microphone could not be opened.');
      }
    };

    void start();

    return () => {
      stopped = true;
      cancelAnimationFrame(frame);
      stream?.getTracks().forEach((track) => track.stop());
      if (context && context.state !== 'closed') void context.close();
    };
  }, [deviceId]);

  const toPercent = (db: number) => Math.min(100, Math.max(0, ((db - floorDb) / -floorDb) * 100));

  return (
    <div className="meter-field field-span flex flex-col gap-2">
      <span className="text-xs font-medium text-muted-foreground">Microphone level</span>
      {failure ? (
        <small className="text-[11px] text-destructive" role="alert">
          {failure}
        </small>
      ) : (
        <>
          <div className="meter relative h-2 overflow-hidden rounded-full bg-secondary" role="meter" aria-label="Microphone level" aria-valuenow={Math.round(levelDb)} aria-valuemin={floorDb} aria-valuemax={0}>
            <i
              className="block h-full rounded-full bg-gradient-to-r from-success to-primary transition-[width] duration-75"
              style={{ width: `${toPercent(levelDb)}%` }}
            />
            <b
              className="absolute -top-0.5 bottom-[-0.125rem] w-0.5 bg-foreground"
              style={{ left: `${toPercent(gateThresholdDb)}%` }}
            />
          </div>
          <small className="text-[11px] text-muted-foreground">Speak normally: the bar should pass the marker, which is where the noise gate opens.</small>
        </>
      )}
    </div>
  );
}
