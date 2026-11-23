import { describe, expect, it } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { diagnoseStream, parseSending, type StreamHealth } from '../../src/renderer/domain/stream-health';
import { InboundMeter, OutboundMeter } from '../../src/renderer/infrastructure/media/stream-stats';
import { StreamHealthIndicator, StreamHealthPanel } from '../../src/renderer/components/stream-health';
import type { Participant } from '../../src/renderer/domain/conference';

const report = (...entries: Record<string, unknown>[]) =>
  new Map(entries.map((entry, index) => [String(index), entry])) as unknown as RTCStatsReport;

const clean = { freezes: 0, frozenSeconds: 0 };

describe('stream diagnosis', () => {
  it("names the sender's upload before anything else", () => {
    const verdict = diagnoseStream(
      { history: [], sending: { limit: 'bandwidth' }, receiving: { ...clean, lossPercent: 3 } },
      'Ana',
      false,
    );
    expect(verdict).toMatchObject({ tone: 'warn', title: "Ana's upload can't keep up" });
  });

  it('blames the way in when the sender is fine and packets go missing here', () => {
    const verdict = diagnoseStream(
      { history: [], sending: { limit: 'none', lossPercent: 0 }, receiving: { ...clean, lossPercent: 7 } },
      'Ana',
      false,
    );
    expect(verdict).toMatchObject({ tone: 'bad', title: 'Packets are lost on the way to you' });
  });

  it('speaks to the sharer about their own screen', () => {
    expect(diagnoseStream({ history: [], sending: { limit: 'cpu' } }, 'Cauan', true).title).toBe(
      "Your computer can't encode fast enough",
    );
    expect(diagnoseStream(undefined, 'Ana', false).tone).toBe('unknown');
  });

  it('believes only a sensible report from another machine', () => {
    expect(parseSending({ limit: 'bandwidth', fps: 41, kbps: -3, lossPercent: 400 })).toEqual({
      limit: 'bandwidth',
      fps: 41,
      width: undefined,
      height: undefined,
      targetFps: undefined,
      kbps: undefined,
      targetKbps: undefined,
      lossPercent: undefined,
    });
    expect(parseSending({ limit: 'everything' })).toBeUndefined();
    expect(parseSending('nonsense')).toBeUndefined();
  });
});

describe('stream meters', () => {
  it('reads the encoder, its reason and its rate between two readings', () => {
    const meter = new OutboundMeter();
    const outbound = (bytesSent: number) =>
      report(
        {
          type: 'outbound-rtp',
          kind: 'video',
          bytesSent,
          frameWidth: 1920,
          frameHeight: 1080,
          framesPerSecond: 42,
          qualityLimitationReason: 'bandwidth',
        },
        { type: 'remote-inbound-rtp', kind: 'video', fractionLost: 0.02 },
      );
    expect(meter.read(outbound(0), 60, 0)?.kbps).toBeUndefined();
    expect(meter.read(outbound(500_000), 60, 2_000)).toMatchObject({
      kbps: 2_000,
      fps: 42,
      targetFps: 60,
      height: 1080,
      limit: 'bandwidth',
      lossPercent: 2,
    });
  });

  it('counts what went missing on the way here in the last reading only', () => {
    const meter = new InboundMeter();
    const inbound = (bytesReceived: number, packetsReceived: number, packetsLost: number) =>
      report({
        type: 'inbound-rtp',
        kind: 'video',
        bytesReceived,
        packetsReceived,
        packetsLost,
        framesPerSecond: 30,
        freezeCount: 2,
        totalFreezesDuration: 1.5,
        jitter: 0.012,
      });
    meter.read(inbound(0, 1_000, 500), 0);
    expect(meter.read(inbound(250_000, 1_190, 510), 1_000)).toMatchObject({
      kbps: 2_000,
      lossPercent: 5,
      freezes: 2,
      frozenSeconds: 1.5,
      jitterMs: 12,
    });
  });
});

describe('stream health indicator', () => {
  const ana: Participant = {
    id: 'ana',
    name: 'Ana',
    initials: 'AN',
    accent: '#fff',
    isLocal: false,
    isMuted: false,
    isSpeaking: false,
    volume: 100,
    locallyMuted: false,
    isBroadcasting: true,
  };
  const health: StreamHealth = {
    history: [
      { at: 0, fps: 50 },
      { at: 2_000, fps: 34 },
    ],
    sending: { limit: 'bandwidth', fps: 35, targetFps: 60, kbps: 2_140, height: 1080, width: 1920 },
    receiving: { ...clean, fps: 34, kbps: 2_110, lossPercent: 0.3, height: 1080, width: 1920 },
  };

  it('shows what arrives on the chip, named for the likely culprit', async () => {
    render(<StreamHealthIndicator participant={ana} read={async () => health} />);
    const trigger = await screen.findByLabelText("Stream health: Ana's upload can't keep up");
    await waitFor(() => expect(trigger).toHaveTextContent('34fps2.1 Mbps'));
  });

  // Opening the floating panel is left to the browser: jsdom crawls once one is positioned.
  it('lays out both ends of the line under the verdict', () => {
    render(<StreamHealthPanel participant={ana} health={health} />);
    expect(screen.getByRole('heading', { name: "Ana's upload can't keep up" })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: "Ana's encoder" })).toHaveTextContent('Held back byUpload');
    expect(screen.getByRole('region', { name: 'What reaches you' })).toHaveTextContent('Lost0.3%');
    expect(screen.getByRole('img', { name: /Frames per second/ })).toBeInTheDocument();
  });
});
