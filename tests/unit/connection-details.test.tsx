import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ConnectionDetails } from '../../src/renderer/components/connection-details';
import {
  readLine,
  summariseConnection,
} from '../../src/renderer/infrastructure/conference/livekit-conference-gateway';

afterEach(cleanup);

const minute = 60_000;
const start = Date.UTC(2026, 9, 10, 13, 43);
const samples = Array.from({ length: 80 }, (_, index) => ({
  at: start + index * 3_000,
  pingMs: index === 40 ? 31 : 7,
}));

describe('the connection panel', () => {
  it('draws the ping over time and says the numbers that settle whose line it is', async () => {
    const read = vi.fn(async () => ({
      samples,
      lastPingMs: 7,
      averagePingMs: 7.3,
      sentLossPercent: 0,
      transport: 'udp' as const,
    }));

    render(<ConnectionDetails read={read} />);

    await waitFor(() =>
      expect(
        screen.getByRole('img', { name: /Ping over the last 4 minutes, up to 31 ms/ }),
      ).toBeInTheDocument(),
    );
    expect(screen.getByText('Average ping').nextSibling).toHaveTextContent('7 ms');
    expect(screen.getByText('Last ping').nextSibling).toHaveTextContent('7 ms');
    expect(screen.getByText('Outbound packet loss').nextSibling).toHaveTextContent('0.0%');
    expect(screen.getByText('UDP, direct')).toBeInTheDocument();
    // The axis is a round number above the worst reading.
    expect(screen.getByText('50')).toBeInTheDocument();
  });

  it('calls out loss that a listener would hear', async () => {
    render(
      <ConnectionDetails
        read={vi.fn(async () => ({ samples, lastPingMs: 9, averagePingMs: 9, sentLossPercent: 12.5 }))}
      />,
    );

    await waitFor(() => expect(screen.getByText('12.5%')).toHaveClass(/text-destructive/));
  });

  it('says it is still measuring before there is a line to draw', async () => {
    render(<ConnectionDetails read={vi.fn(async () => ({ samples: [] }))} />);

    await waitFor(() => expect(screen.getByText('Measuring your connection…')).toBeInTheDocument());
    expect(screen.getByText('Average ping').nextSibling).toHaveTextContent('—');
  });
});

describe('reading the line out of WebRTC statistics', () => {
  const report = (entries: Record<string, unknown>[]) =>
    new Map(entries.map((entry) => [entry.id as string, entry])) as unknown as RTCStatsReport;

  it('takes the round trip from the pair the call is using, and counts what was sent and lost', () => {
    const line = readLine(
      report([
        { id: 'T', type: 'transport', selectedCandidatePairId: 'P2' },
        { id: 'P1', type: 'candidate-pair', currentRoundTripTime: 0.4, localCandidateId: 'L1' },
        { id: 'P2', type: 'candidate-pair', currentRoundTripTime: 0.007, localCandidateId: 'L2' },
        { id: 'L2', type: 'local-candidate', protocol: 'udp', candidateType: 'host' },
        { id: 'O', type: 'outbound-rtp', kind: 'audio', packetsSent: 1000 },
        { id: 'R', type: 'remote-inbound-rtp', kind: 'audio', packetsLost: 12 },
        { id: 'V', type: 'outbound-rtp', kind: 'video', packetsSent: 90_000 },
      ]),
    );

    expect(line).toEqual({ pingMs: 7, transport: 'udp', sent: 1000, lost: 12 });
  });

  it('knows a relayed or TCP route when it sees one', () => {
    const pair = {
      id: 'P',
      type: 'candidate-pair',
      nominated: true,
      state: 'succeeded',
      localCandidateId: 'L',
    };
    expect(readLine(report([pair, { id: 'L', candidateType: 'relay', protocol: 'udp' }]))?.transport).toBe(
      'relay',
    );
    expect(readLine(report([pair, { id: 'L', candidateType: 'host', protocol: 'tcp' }]))?.transport).toBe(
      'tcp',
    );
    expect(readLine(report([{ id: 'X', type: 'codec' }]))).toBeUndefined();
  });

  it('counts loss over the window, so a bad minute that has passed stops counting', () => {
    const report = summariseConnection(
      [
        { at: 0, pingMs: 6 },
        { at: minute, pingMs: 10 },
      ],
      [
        { sent: 5_000, lost: 400 },
        { sent: 5_500, lost: 405 },
        { sent: 6_000, lost: 410 },
      ],
      'udp',
    );

    expect(report.lastPingMs).toBe(10);
    expect(report.averagePingMs).toBe(8);
    expect(report.sentLossPercent).toBeCloseTo((10 / 1010) * 100);
    expect(summariseConnection([], []).sentLossPercent).toBeUndefined();
    expect(summariseConnection([], [{ sent: 0, lost: 0 }]).sentLossPercent).toBe(0);
  });
});
