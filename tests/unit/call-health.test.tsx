import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CallHealth } from '../../src/renderer/components/call-health';

afterEach(cleanup);

describe('CallHealth', () => {
  it('names the line that is not delivering, rather than the microphone', async () => {
    const read = vi.fn(async () => [
      { id: 'babi', name: 'babi', concealedPercent: 3.4, jitterMs: 28, jitterBufferMs: 96 },
      { id: 'allan', name: 'allan', concealedPercent: 0.02, jitterMs: 2, jitterBufferMs: 31 },
    ]);

    render(<CallHealth read={read} />);

    await waitFor(() => expect(screen.getByText('3.40% invented')).toBeInTheDocument());
    // Only the one that is actually rough is called out.
    expect(screen.getByText('3.40% invented')).toHaveClass(/text-destructive/);
    expect(screen.getByText('0.02% invented')).not.toHaveClass(/text-destructive/);
  });

  it('says nothing at all when there is nobody to report on', async () => {
    const { container } = render(<CallHealth read={vi.fn(async () => [])} />);

    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });

  it('holds its tongue rather than throwing when the reading fails', async () => {
    const { container } = render(
      <CallHealth read={vi.fn(async () => Promise.reject(new Error('no connection')))} />,
    );

    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });

  it('shows a dash for somebody the receiver has no numbers for yet', async () => {
    render(<CallHealth read={vi.fn(async () => [{ id: 'new', name: 'castielrng' }])} />);

    await waitFor(() => expect(screen.getByText('castielrng')).toBeInTheDocument());
    expect(screen.getByText('—')).toBeInTheDocument();
  });
});
