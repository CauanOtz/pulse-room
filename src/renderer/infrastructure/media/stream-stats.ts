import type { EncoderLimit, StreamReceiving, StreamSending } from '../../domain/stream-health';

type Stat = Record<string, unknown>;

const number = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) ? value : undefined);

function videoEntry(report: RTCStatsReport | undefined, type: string): Stat | undefined {
  let found: Stat | undefined;
  report?.forEach((entry) => {
    const stat = entry as Stat;
    if (stat.type !== type || stat.kind !== 'video') return;
    // A sender with layers reports one per layer; the widest is what is seen.
    if (!found || (number(stat.frameWidth) ?? 0) > (number(found.frameWidth) ?? 0)) found = stat;
  });
  return found;
}

function bitrate(bytes: number | undefined, previous: { at: number; bytes: number } | undefined, at: number) {
  if (bytes === undefined || !previous || at <= previous.at || bytes < previous.bytes) return undefined;
  return ((bytes - previous.bytes) * 8) / (at - previous.at);
}

const limits: readonly EncoderLimit[] = ['none', 'bandwidth', 'cpu', 'other'];

/**
 * Reads the sender's own encoder. Rates come from the difference between two
 * readings, so the first one knows the picture but not yet the bitrate.
 */
export class OutboundMeter {
  private last?: { at: number; bytes: number };

  public read(
    report: RTCStatsReport | undefined,
    targetFps?: number,
    at = Date.now(),
  ): StreamSending | undefined {
    const outbound = videoEntry(report, 'outbound-rtp');
    if (!outbound) return undefined;
    const remote = videoEntry(report, 'remote-inbound-rtp');
    const bytes = number(outbound.bytesSent);
    const kbps = bitrate(bytes, this.last, at);
    if (bytes !== undefined) this.last = { at, bytes };
    const fraction = number(remote?.fractionLost);
    const target = number(outbound.targetBitrate);
    return {
      width: number(outbound.frameWidth),
      height: number(outbound.frameHeight),
      fps: number(outbound.framesPerSecond),
      targetFps,
      kbps,
      targetKbps: target === undefined ? undefined : target / 1000,
      limit: limits.find((limit) => limit === outbound.qualityLimitationReason) ?? 'none',
      lossPercent: fraction === undefined ? undefined : fraction * 100,
    };
  }

  public reset(): void {
    this.last = undefined;
  }
}

/** Reads what reached this machine of somebody else's screen. */
export class InboundMeter {
  private last?: { at: number; bytes: number; received: number; lost: number };

  public read(report: RTCStatsReport | undefined, at = Date.now()): StreamReceiving | undefined {
    const inbound = videoEntry(report, 'inbound-rtp');
    if (!inbound) return undefined;
    const bytes = number(inbound.bytesReceived);
    const received = number(inbound.packetsReceived) ?? 0;
    const lost = Math.max(0, number(inbound.packetsLost) ?? 0);
    const kbps = bitrate(bytes, this.last, at);
    let lossPercent: number | undefined;
    if (this.last) {
      const arrived = received - this.last.received;
      const missing = Math.max(0, lost - this.last.lost);
      if (arrived + missing > 0) lossPercent = (missing / (arrived + missing)) * 100;
    }
    if (bytes !== undefined) this.last = { at, bytes, received, lost };
    const jitter = number(inbound.jitter);
    return {
      width: number(inbound.frameWidth),
      height: number(inbound.frameHeight),
      fps: number(inbound.framesPerSecond),
      kbps,
      lossPercent,
      freezes: number(inbound.freezeCount) ?? 0,
      frozenSeconds: number(inbound.totalFreezesDuration) ?? 0,
      jitterMs: jitter === undefined ? undefined : jitter * 1000,
    };
  }
}
