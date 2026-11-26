// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  launchTiming,
  updateBeforeLaunch,
  type LaunchScreen,
} from '../../src/main/application/launch-update';
import type { UpdateStatus } from '../../src/shared/desktop-api';

function harness(answer: () => Promise<UpdateStatus>) {
  const listeners = new Set<(status: UpdateStatus) => void>();
  const shown: LaunchScreen[] = [];
  let skip: () => void = () => undefined;
  const updates = {
    check: vi.fn(answer),
    install: vi.fn(),
    onStatus: (listener: (status: UpdateStatus) => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
  const outcome = updateBeforeLaunch(updates, {
    show: (screen) => shown.push(screen),
    onSkip: (listener) => {
      skip = listener;
    },
  });
  return {
    updates,
    shown,
    outcome,
    emit: (status: UpdateStatus) => listeners.forEach((listener) => listener(status)),
    skip: () => skip(),
    listening: () => listeners.size,
  };
}

const never = () => new Promise<UpdateStatus>(() => undefined);

describe('updating before the app opens', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('opens straight away when there is nothing new', async () => {
    const run = harness(async () => ({ state: 'not-available', version: '1.0.0' }));
    await expect(run.outcome).resolves.toBe('open');
    expect(run.shown.map((screen) => screen.phase)).toEqual(['checking', 'starting']);
    expect(run.updates.install).not.toHaveBeenCalled();
    expect(run.listening()).toBe(0);
  });

  it('opens when the feed cannot be reached, or takes too long to answer', async () => {
    await expect(harness(() => Promise.reject(new Error('offline'))).outcome).resolves.toBe('open');
    const slow = harness(never);
    await vi.advanceTimersByTimeAsync(launchTiming.checkMs);
    await expect(slow.outcome).resolves.toBe('open');
  });

  it('downloads a new version, shows how far it got, and installs it', async () => {
    const run = harness(never);
    run.emit({ state: 'available', version: '1.1.0' });
    run.emit({ state: 'downloading', percent: 42, transferred: 42, total: 100, bytesPerSecond: 8 });
    // Taking its time is fine while it moves: the check's own limit no longer applies.
    await vi.advanceTimersByTimeAsync(launchTiming.checkMs + 1);
    expect(run.shown.at(-1)).toMatchObject({
      phase: 'downloading',
      version: '1.1.0',
      percent: 42,
      total: 100,
    });
    run.emit({ state: 'downloaded', version: '1.1.0' });
    expect(run.shown.at(-1)).toEqual({ phase: 'installing', version: '1.1.0' });
    expect(run.updates.install).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(launchTiming.installLeadMs);
    await expect(run.outcome).resolves.toBe('installing');
    expect(run.updates.install).toHaveBeenCalledOnce();
  });

  it('offers to open without waiting, and opens when asked', async () => {
    const run = harness(never);
    run.emit({ state: 'downloading', percent: 3, version: '1.1.0' });
    expect(run.shown.at(-1)).toMatchObject({ canSkip: false });
    await vi.advanceTimersByTimeAsync(launchTiming.skipAfterMs);
    expect(run.shown.at(-1)).toMatchObject({ phase: 'downloading', canSkip: true });
    run.skip();
    await expect(run.outcome).resolves.toBe('open');
    // A download finishing afterwards changes nothing here; the app's own notice takes it.
    run.emit({ state: 'downloaded', version: '1.1.0' });
    expect(run.updates.install).not.toHaveBeenCalled();
  });

  it('gives up on a download that stopped moving, and on an error', async () => {
    const stalled = harness(never);
    stalled.emit({ state: 'downloading', percent: 10 });
    await vi.advanceTimersByTimeAsync(launchTiming.stallMs - 1);
    stalled.emit({ state: 'downloading', percent: 11 });
    await vi.advanceTimersByTimeAsync(launchTiming.stallMs - 1);
    expect(stalled.shown.at(-1)?.phase).toBe('downloading');
    await vi.advanceTimersByTimeAsync(1);
    await expect(stalled.outcome).resolves.toBe('open');

    const failed = harness(never);
    failed.emit({ state: 'available', version: '1.1.0' });
    failed.emit({ state: 'error', message: 'disk full' });
    await expect(failed.outcome).resolves.toBe('open');
  });
});
