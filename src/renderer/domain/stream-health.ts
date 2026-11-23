/**
 * Why a shared screen stutters, from both ends of it.
 *
 * A stream that stalls for one viewer can be failing in three different places:
 * the sender's upload, the sender's computer, or the line between the server
 * and the viewer. Each has a different fix, and only the sender's machine knows
 * the first two, so the sender reports what its encoder is doing and the viewer
 * puts that beside what actually arrived.
 */

/** What WebRTC says is holding the sender's encoder back, in its own terms. */
export type EncoderLimit = 'none' | 'bandwidth' | 'cpu' | 'other';

/** The sender's side: what its encoder is making, and what stops it. */
export interface StreamSending {
  width?: number;
  height?: number;
  fps?: number;
  /** The frame rate the chosen quality asks for. */
  targetFps?: number;
  kbps?: number;
  /** What the encoder believes the line can take right now. */
  targetKbps?: number;
  limit: EncoderLimit;
  /** Share of the sender's packets the server reported missing. */
  lossPercent?: number;
}

/** The viewer's side: what came out of the network on this machine. */
export interface StreamReceiving {
  width?: number;
  height?: number;
  fps?: number;
  kbps?: number;
  /** Share of the packets in the last reading that never arrived. */
  lossPercent?: number;
  /** Times the picture stood still long enough to notice. */
  freezes: number;
  frozenSeconds: number;
  jitterMs?: number;
}

export interface StreamSample {
  at: number;
  fps: number;
}

export interface StreamHealth {
  /** Absent when the sender's application does not report its side. */
  sending?: StreamSending;
  /** Absent for one's own screen, which this machine does not receive. */
  receiving?: StreamReceiving;
  /** Frames per second over the last minutes, oldest first. */
  history: StreamSample[];
}

export type StreamTone = 'good' | 'warn' | 'bad' | 'unknown';

export interface StreamVerdict {
  tone: StreamTone;
  title: string;
  detail: string;
}

/** Loss that a viewer starts to see as smearing or a stalled picture. */
const visibleLossPercent = 2;
/** Loss that breaks a stream outright. */
const severeLossPercent = 6;

/**
 * The single most likely reason, said the way the person who can fix it would
 * want to hear it. The sender's own report is trusted first, because the
 * encoder knows why it cut quality; loss is the explanation when it does not.
 */
export function diagnoseStream(
  health: StreamHealth | undefined,
  name: string,
  isLocal: boolean,
): StreamVerdict {
  const sending = health?.sending;
  const receiving = health?.receiving;
  const whose = isLocal ? 'Your' : `${name}'s`;
  if (!sending && !receiving) {
    return {
      tone: 'unknown',
      title: 'Measuring the stream',
      detail: 'The first readings arrive in a few seconds.',
    };
  }

  if (sending?.limit === 'bandwidth') {
    return {
      tone: 'warn',
      title: `${whose} upload can't keep up`,
      detail: 'The encoder is lowering quality to fit the line. Efficient (720p) needs about a third of it.',
    };
  }
  if (sending?.limit === 'cpu') {
    return {
      tone: 'warn',
      title: `${whose} computer can't encode fast enough`,
      detail: 'Close something heavy, or share at a lighter quality.',
    };
  }

  const inbound = receiving?.lossPercent ?? 0;
  if (inbound >= visibleLossPercent) {
    return {
      tone: inbound >= severeLossPercent ? 'bad' : 'warn',
      title: 'Packets are lost on the way to you',
      detail: isLocal
        ? 'The picture leaves intact and is dropped on the line.'
        : `The picture leaves ${name} intact. Your connection or Wi-Fi is dropping it.`,
    };
  }
  const outbound = sending?.lossPercent ?? 0;
  if (outbound >= visibleLossPercent) {
    return {
      tone: outbound >= severeLossPercent ? 'bad' : 'warn',
      title: isLocal ? 'Your packets are lost on the way out' : `Packets are lost leaving ${name}`,
      detail: `${isLocal ? 'Your' : 'Their'} line to the server is dropping the picture: Wi-Fi is the usual suspect.`,
    };
  }

  if (!sending && !isLocal) {
    return {
      tone: 'good',
      title: 'Arriving cleanly',
      detail: `${name}'s app does not report its side yet, so only what reaches you is known.`,
    };
  }
  return { tone: 'good', title: 'Smooth', detail: 'Nothing is holding this stream back.' };
}

const limits: readonly EncoderLimit[] = ['none', 'bandwidth', 'cpu', 'other'];

/** A finite, non-negative number, or nothing: a report comes from another machine. */
function reading(value: unknown, ceiling: number): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= ceiling
    ? value
    : undefined;
}

/** The sender's report as another client sent it, kept only if it makes sense. */
export function parseSending(value: unknown): StreamSending | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const report = value as Record<string, unknown>;
  const limit = limits.find((candidate) => candidate === report.limit);
  if (!limit) return undefined;
  return {
    limit,
    width: reading(report.width, 16_384),
    height: reading(report.height, 16_384),
    fps: reading(report.fps, 1_000),
    targetFps: reading(report.targetFps, 1_000),
    kbps: reading(report.kbps, 1_000_000),
    targetKbps: reading(report.targetKbps, 1_000_000),
    lossPercent: reading(report.lossPercent, 100),
  };
}

export const formatKbps = (kbps?: number) =>
  kbps === undefined ? '—' : kbps >= 1000 ? `${(kbps / 1000).toFixed(1)} Mbps` : `${Math.round(kbps)} kbps`;

export const formatPicture = (width?: number, height?: number) =>
  height === undefined ? '—' : width !== undefined && width < height ? `${width}×${height}` : `${height}p`;
