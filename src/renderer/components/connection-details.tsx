import { useEffect, useState, type PointerEvent } from 'react';
import type { ConnectionReport, ConnectionSample } from '../domain/conference';
import { cn } from './ui/utils';

const pollMs = 2_000;
const clock = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' });
const clockWithSeconds = new Intl.DateTimeFormat(undefined, {
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

const transportWording: Record<NonNullable<ConnectionReport['transport']>, string> = {
  udp: 'UDP, direct',
  tcp: 'TCP, slower than UDP',
  relay: 'Relayed, slower than direct',
};

/**
 * Your own line to the voice server: the round trip over the last few
 * minutes, and how much of what you sent never got there.
 *
 * These are the two numbers that settle whose problem a bad call is. A steady
 * low ping and no loss here means your voice is leaving this machine intact,
 * and the trouble is on somebody else's line.
 */
export function ConnectionDetails({ read }: { read(): Promise<ConnectionReport> }) {
  const [report, setReport] = useState<ConnectionReport>();

  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      const next = await read().catch(() => undefined);
      if (stopped) return;
      if (next) setReport(next);
      timer = setTimeout(() => void poll(), pollMs);
    };
    void poll();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [read]);

  const loss = report?.sentLossPercent;
  const lossy = loss !== undefined && loss >= 1;

  return (
    <div className="connection-details flex flex-col gap-3">
      <PingChart samples={report?.samples ?? []} />
      <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1.5 text-xs">
        <dt className="text-muted-foreground">Average ping</dt>
        <dd className="text-right font-mono tabular-nums text-foreground">
          {milliseconds(report?.averagePingMs)}
        </dd>
        <dt className="text-muted-foreground">Last ping</dt>
        <dd className="text-right font-mono tabular-nums text-foreground">
          {milliseconds(report?.lastPingMs)}
        </dd>
        <dt className="text-muted-foreground">Outbound packet loss</dt>
        <dd
          className={cn(
            'text-right font-mono tabular-nums',
            lossy ? 'font-semibold text-destructive' : 'text-foreground',
          )}
        >
          {loss === undefined ? '—' : `${loss.toFixed(1)}%`}
        </dd>
        {report?.transport && (
          <>
            <dt className="text-muted-foreground">Route</dt>
            <dd className="text-right text-foreground">{transportWording[report.transport]}</dd>
          </>
        )}
      </dl>
      <p className="text-[11px] leading-relaxed text-muted-foreground">
        Audio starts to feel late from about 250 ms. Loss above 10% makes your voice sound robotic to everyone
        else. If both are low here and somebody still sounds choppy, the trouble is on their line.
      </p>
    </div>
  );
}

const milliseconds = (value?: number) => (value === undefined ? '—' : `${Math.round(value)} ms`);

/** A round number at or above the highest reading, so the axis reads cleanly. */
function ceiling(highest: number): number {
  for (const step of [10, 20, 50, 100, 200, 500, 1000, 2000]) if (highest <= step) return step;
  return Math.ceil(highest / 1000) * 1000;
}

const width = 280;
const height = 112;
const pad = { top: 8, right: 26, bottom: 18, left: 2 };
const plotWidth = width - pad.left - pad.right;
const plotHeight = height - pad.top - pad.bottom;

/** The round trip over time, one line, with the reading under the pointer named. */
function PingChart({ samples }: { samples: readonly ConnectionSample[] }) {
  const [hover, setHover] = useState<number>();

  if (samples.length < 2) {
    return (
      <div className="grid h-28 place-items-center rounded-lg border border-border bg-background/50 text-xs text-muted-foreground">
        Measuring your connection…
      </div>
    );
  }

  const start = samples[0]!.at;
  const end = samples.at(-1)!.at;
  const span = Math.max(1, end - start);
  const top = ceiling(Math.max(...samples.map((sample) => sample.pingMs)));
  const x = (at: number) => pad.left + ((at - start) / span) * plotWidth;
  const y = (ping: number) => pad.top + plotHeight - (Math.min(ping, top) / top) * plotHeight;
  const points = samples.map((sample) => `${x(sample.at).toFixed(1)},${y(sample.pingMs).toFixed(1)}`);
  const line = `M${points.join('L')}`;
  const area = `${line}L${x(end).toFixed(1)},${pad.top + plotHeight}L${x(start).toFixed(1)},${pad.top + plotHeight}Z`;

  // A label a minute or so apart, never crowding: at most four of them.
  const minute = 60_000;
  const every = Math.max(1, Math.ceil(span / minute / 3)) * minute;
  const ticks: number[] = [];
  for (let at = Math.ceil(start / every) * every; at <= end; at += every) ticks.push(at);

  const pointed = hover === undefined ? undefined : samples[hover];
  const locate = (event: PointerEvent<SVGRectElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    const at = start + ((event.clientX - box.left) / box.width) * span;
    let nearest = 0;
    samples.forEach((sample, index) => {
      if (Math.abs(sample.at - at) < Math.abs(samples[nearest]!.at - at)) nearest = index;
    });
    setHover(nearest);
  };

  return (
    <div className="relative rounded-lg border border-border bg-background/50 px-2 pt-1.5">
      <svg
        className="block w-full overflow-visible"
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={`Ping over the last ${Math.max(1, Math.round(span / minute))} minutes, up to ${Math.round(
          Math.max(...samples.map((sample) => sample.pingMs)),
        )} ms`}
      >
        {[0, top / 2, top].map((value) => (
          <g key={value}>
            <line
              x1={pad.left}
              x2={pad.left + plotWidth}
              y1={y(value)}
              y2={y(value)}
              stroke="var(--border)"
              strokeWidth={1}
            />
            <text
              x={width - pad.right + 5}
              y={y(value) + 3.5}
              className="fill-muted-foreground font-mono text-[9px]"
            >
              {value}
            </text>
          </g>
        ))}
        {ticks.map((at) => (
          <text
            key={at}
            x={x(at)}
            y={height - 4}
            textAnchor="middle"
            className="fill-muted-foreground font-mono text-[9px]"
          >
            {clock.format(at)}
          </text>
        ))}
        <path d={area} fill="var(--foreground)" opacity={0.06} />
        <path
          d={line}
          fill="none"
          stroke="var(--foreground)"
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {pointed && (
          <g>
            <line
              x1={x(pointed.at)}
              x2={x(pointed.at)}
              y1={pad.top}
              y2={pad.top + plotHeight}
              stroke="var(--muted-foreground)"
              strokeWidth={1}
              strokeDasharray="2 2"
            />
            <circle
              cx={x(pointed.at)}
              cy={y(pointed.pingMs)}
              r={4}
              fill="var(--foreground)"
              stroke="var(--popover)"
              strokeWidth={2}
            />
          </g>
        )}
        <rect
          x={pad.left}
          y={pad.top}
          width={plotWidth}
          height={plotHeight}
          fill="transparent"
          onPointerMove={locate}
          onPointerLeave={() => setHover(undefined)}
        />
      </svg>
      {pointed && (
        <span
          className="pointer-events-none absolute top-1 rounded-md border border-border bg-popover px-1.5 py-0.5 font-mono text-[10px] tabular-nums text-foreground shadow-md"
          style={{
            left: `${(x(pointed.at) / width) * 100}%`,
            transform: `translateX(${x(pointed.at) > width / 2 ? '-105%' : '5%'})`,
          }}
        >
          {Math.round(pointed.pingMs)} ms · {clockWithSeconds.format(pointed.at)}
        </span>
      )}
    </div>
  );
}
