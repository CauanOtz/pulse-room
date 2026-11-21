import { act, cleanup, render, screen } from '@testing-library/react';
import { MotionGlobalConfig } from 'motion/react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  finishedHoldMs,
  installLeadMs,
  UpdateScreen,
  updateFlow,
} from '../../src/renderer/components/update-screen';
import type { FinishedUpdate, UpdateStatus } from '../../src/shared/desktop-api';

function stubDesktop(finished: FinishedUpdate | null = null) {
  let listener: ((status: UpdateStatus) => void) | undefined;
  const install = vi.fn(async () => undefined);
  Object.assign(window, {
    desktop: {
      updates: {
        check: vi.fn(),
        install,
        current: vi.fn(async () => ({ state: 'idle' }) as UpdateStatus),
        finished: vi.fn(async () => finished),
        onStatus: (next: (status: UpdateStatus) => void) => {
          listener = next;
          return () => (listener = undefined);
        },
      },
    },
  });
  return { install, send: (status: UpdateStatus) => act(() => listener?.(status)) };
}

const progress = () => Number(screen.getByRole('progressbar').getAttribute('aria-valuenow'));

describe('UpdateScreen', () => {
  // Entrances and exits finish at once, so the test sees where they end.
  beforeAll(() => {
    MotionGlobalConfig.skipAnimations = true;
    // jsdom draws nothing; the lines behind and the sheen fall back to flat colour.
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
  });
  afterAll(() => (MotionGlobalConfig.skipAnimations = false));
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    cleanup();
    act(() => updateFlow.cancel());
    vi.useRealTimers();
    delete (window as { desktop?: unknown }).desktop;
  });

  it('stays out of the way until somebody asks for the update', async () => {
    stubDesktop();
    render(<UpdateScreen />);
    await act(async () => undefined);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('follows the download, then fills the bar and hands over to the installer', async () => {
    const desktop = stubDesktop();
    render(<UpdateScreen />);
    await act(async () => undefined);

    act(() => updateFlow.start());
    desktop.send({ state: 'downloading', percent: 42, version: '9.9.9', bytesPerSecond: 3 * 1_048_576 });
    expect(screen.getByRole('dialog')).toHaveTextContent('Updating');
    expect(screen.getByRole('dialog')).toHaveTextContent('v9.9.9');
    expect(screen.getByRole('dialog')).toHaveTextContent('3.0 MB/s');
    expect(progress()).toBe(42);

    desktop.send({ state: 'downloaded', version: '9.9.9' });
    expect(screen.getByRole('dialog')).toHaveTextContent('Installing');
    expect(progress()).toBe(100);
    expect(desktop.install).not.toHaveBeenCalled();

    // The bar is given its moment to fill before the window goes.
    act(() => void vi.advanceTimersByTime(installLeadMs));
    expect(desktop.install).toHaveBeenCalledTimes(1);
    // Further news does not install twice.
    desktop.send({ state: 'downloaded', version: '9.9.9' });
    act(() => void vi.advanceTimersByTime(installLeadMs));
    expect(desktop.install).toHaveBeenCalledTimes(1);
  });

  it('says what went wrong and lets the person close it', async () => {
    const desktop = stubDesktop();
    render(<UpdateScreen />);
    await act(async () => undefined);
    act(() => updateFlow.start());
    desktop.send({ state: 'error', message: 'The download was interrupted.' });

    expect(screen.getByRole('dialog')).toHaveTextContent('Update failed');
    expect(screen.getByRole('dialog')).toHaveTextContent('The download was interrupted.');
    act(() => screen.getByRole('button', { name: 'Close' }).click());
    expect(updateFlow.isRequested()).toBe(false);
  });

  it('greets the new version after the restart, then steps aside', async () => {
    stubDesktop({ from: '0.17.1', to: '0.18.0' });
    render(<UpdateScreen />);
    await act(async () => undefined);

    expect(screen.getByRole('dialog')).toHaveTextContent('Updated');
    expect(screen.getByRole('dialog')).toHaveTextContent('From 0.17.1 to 0.18.0');
    expect(progress()).toBe(100);

    await act(async () => void vi.advanceTimersByTime(finishedHoldMs));
    await act(async () => void vi.advanceTimersByTime(1_000));
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
