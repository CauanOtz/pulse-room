import { useEffect, useState } from 'react';
import type { Participant } from '../domain/conference';
import {
  diagnoseStream,
  formatKbps,
  formatPicture,
  type EncoderLimit,
  type StreamHealth,
  type StreamSample,
} from '../domain/stream-health';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';
import { cn } from './ui/utils';

const pollMs = 2_000;

const limitWording: Record<EncoderLimit, string> = {
  none: 'Nothing',
  bandwidth: 'Upload',
  cpu: 'Processor',
  other: 'Other',
};

const percent = (value?: number) =>
  value === undefined ? '—' : `${value < 10 ? value.toFixed(1) : Math.round(value)}%`;
const frames = (fps?: number, target?: number) =>
  fps === undefined ? '—' : target ? `${Math.round(fps)} / ${target}` : `${Math.round(fps)}`;

/**
 * Why a stream looks the way it does, one click from the picture.
 *
 * The chip says the two numbers anybody would ask first; the panel names the
 * likely culprit and shows both ends of the line, so that "it is stuttering"
 * becomes "her upload cannot keep up" before anybody starts guessing.
 */
export function StreamHealthIndicator({
  participant,
  read,
  onOpenChange,
}: {
  participant: Participant;
  read(participantId: string): Promise<StreamHealth | undefined>;
  /** The player keeps its bars up while the panel is being read. */
  onOpenChange?(open: boolean): void;
}) {
  const [health, setHealth] = useState<StreamHealth>();
  const id = participant.id;

  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    setHealth(undefined);
    const poll = async () => {
      const next = await read(id).catch(() => undefined);
      if (stopped) return;
      setHealth(next);
      timer = setTimeout(() => void poll(), pollMs);
    };
    void poll();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [id, read]);

  // A stream that ends with the panel open must not hold the player's bars up.
  useEffect(() => () => onOpenChange?.(false), [onOpenChange]);

  const verdict = diagnoseStream(health, participant.name, participant.isLocal);
  const shown = participant.isLocal ? health?.sending : (health?.receiving ?? health?.sending);

  return (
    <Popover onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="stream-health-trigger"
          data-tone={verdict.tone}
          aria-label={`Stream health: ${verdict.title}`}
        >
          <span className="stream-health-dot" aria-hidden="true" />
          <span className="stream-health-figures">
            {shown?.fps === undefined ? '··' : Math.round(shown.fps)}
            <small>fps</small>
            <i aria-hidden="true" />
            {formatKbps(shown?.kbps)}
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="stream-health-panel w-[22rem] p-0">
        <StreamHealthPanel participant={participant} health={health} />
      </PopoverContent>
    </Popover>
  );
}

/** Both ends of the line, under the likeliest reason for what is on screen. */
export function StreamHealthPanel({
  participant,
  health,
}: {
  participant: Participant;
  health?: StreamHealth;
}) {
  const verdict = diagnoseStream(health, participant.name, participant.isLocal);
  const sending = health?.sending;
  const receiving = health?.receiving;
  const owner = participant.isLocal ? 'You' : participant.name;
  return (
    <>
      <header className="stream-health-verdict" data-tone={verdict.tone}>
        <span className="stream-health-dot" aria-hidden="true" />
        <div>
          <h3>{verdict.title}</h3>
          <p>{verdict.detail}</p>
        </div>
      </header>
      <FrameChart samples={health?.history ?? []} target={sending?.targetFps} />
      <div className={cn('stream-health-sides', !receiving && 'is-single')}>
        <section aria-label={participant.isLocal ? 'Your encoder' : `${participant.name}'s encoder`}>
          <h4>
            Sending <span>{owner}</span>
          </h4>
          {sending ? (
            <dl>
              <dt>Picture</dt>
              <dd>{formatPicture(sending.width, sending.height)}</dd>
              <dt>Frames</dt>
              <dd>{frames(sending.fps, sending.targetFps)}</dd>
              <dt>Bitrate</dt>
              <dd>{formatKbps(sending.kbps)}</dd>
              <dt>Held back by</dt>
              <dd className={cn(sending.limit !== 'none' && 'is-culprit')}>{limitWording[sending.limit]}</dd>
              <dt>Lost</dt>
              <dd className={cn((sending.lossPercent ?? 0) >= 2 && 'is-culprit')}>
                {percent(sending.lossPercent)}
              </dd>
            </dl>
          ) : (
            <p className="stream-health-silent">
              {participant.isLocal ? 'Reading your encoder…' : 'Not reported by their app yet.'}
            </p>
          )}
        </section>
        {receiving && (
          <section aria-label="What reaches you">
            <h4>
              Arriving <span>You</span>
            </h4>
            <dl>
              <dt>Picture</dt>
              <dd>{formatPicture(receiving.width, receiving.height)}</dd>
              <dt>Frames</dt>
              <dd>{frames(receiving.fps)}</dd>
              <dt>Bitrate</dt>
              <dd>{formatKbps(receiving.kbps)}</dd>
              <dt>Lost</dt>
              <dd className={cn((receiving.lossPercent ?? 0) >= 2 && 'is-culprit')}>
                {percent(receiving.lossPercent)}
              </dd>
              <dt>Freezes</dt>
              <dd>
                {receiving.freezes}
                {receiving.frozenSeconds > 0 && <small> · {receiving.frozenSeconds.toFixed(1)} s</small>}
              </dd>
              <dt>Jitter</dt>
              <dd>{receiving.jitterMs === undefined ? '—' : `${Math.round(receiving.jitterMs)} ms`}</dd>
            </dl>
          </section>
        )}
      </div>
    </>
  );
}

const width = 320;
const height = 64;
const pad = { top: 6, right: 30, bottom: 6, left: 0 };
const plotWidth = width - pad.left - pad.right;
const plotHeight = height - pad.top - pad.bottom;

/** Frames per second over the last minutes, against what was asked for. */
function FrameChart({ samples, target }: { samples: readonly StreamSample[]; target?: number }) {
  if (samples.length < 2) {
    return (
      <div className="stream-health-chart is-measuring">
        <span>Measuring frames…</span>
      </div>
    );
  }
  const highest = Math.max(target ?? 0, ...samples.map((sample) => sample.fps));
  const top = [30, 60, 120, 240].find((step) => highest <= step) ?? Math.ceil(highest / 60) * 60;
  const start = samples[0]!.at;
  const span = Math.max(1, samples.at(-1)!.at - start);
  const x = (at: number) => pad.left + ((at - start) / span) * plotWidth;
  const y = (fps: number) => pad.top + plotHeight - (Math.min(fps, top) / top) * plotHeight;
  const line = `M${samples.map((sample) => `${x(sample.at).toFixed(1)},${y(sample.fps).toFixed(1)}`).join('L')}`;
  const floor = pad.top + plotHeight;
  const area = `${line}L${x(samples.at(-1)!.at).toFixed(1)},${floor}L${x(start).toFixed(1)},${floor}Z`;
  const last = samples.at(-1)!;
  return (
    <div className="stream-health-chart">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={`Frames per second over the last ${Math.max(1, Math.round(span / 60_000))} minutes`}
      >
        <line x1={pad.left} x2={pad.left + plotWidth} y1={floor} y2={floor} className="stream-health-axis" />
        {target !== undefined && (
          <g className="stream-health-target">
            <line x1={pad.left} x2={pad.left + plotWidth} y1={y(target)} y2={y(target)} />
            <text x={width - pad.right + 6} y={y(target) + 3.5}>
              {target}
            </text>
          </g>
        )}
        <path d={area} className="stream-health-area" />
        <path d={line} className="stream-health-line" />
        <circle cx={x(last.at)} cy={y(last.fps)} r={3} className="stream-health-now" />
      </svg>
    </div>
  );
}
