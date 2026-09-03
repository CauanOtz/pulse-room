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
    <div className="meter-field field-span">
      <span>Microphone level</span>
      {failure ? (
        <small role="alert">{failure}</small>
      ) : (
        <>
          <div className="meter" role="meter" aria-label="Microphone level" aria-valuenow={Math.round(levelDb)} aria-valuemin={floorDb} aria-valuemax={0}>
            <i style={{ width: `${toPercent(levelDb)}%` }} />
            <b style={{ left: `${toPercent(gateThresholdDb)}%` }} />
          </div>
          <small>Speak normally: the bar should pass the marker, which is where the noise gate opens.</small>
        </>
      )}
    </div>
  );
}
