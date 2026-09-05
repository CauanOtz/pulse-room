import { describe, expect, it, vi } from 'vitest';

const sources = [
  { id: 'screen:0:0', name: 'Screen 1', display_id: '1' },
  { id: 'screen:1:0', name: 'Screen 2', display_id: '2' },
];

vi.mock('electron', () => ({
  desktopCapturer: { getSources: vi.fn(async () => sources) },
}));

const { ScreenCaptureService } = await import('../../src/main/application/screen-capture-service');

/** Captures the handler the service installs, and calls it like Chromium does. */
function install() {
  const service = new ScreenCaptureService();
  let handler: (request: { securityOrigin: string }, callback: (result: unknown) => void) => unknown =
    () => undefined;
  service.install({
    setDisplayMediaRequestHandler: (given: typeof handler) => {
      handler = given;
    },
  } as never);
  const ask = async (origin: string) => {
    let answer: { video?: { id: string }; audio?: string } | undefined;
    await handler({ securityOrigin: origin }, (result) => {
      answer = result as typeof answer;
    });
    return answer;
  };
  return { service, ask };
}

describe('ScreenCaptureService', () => {
  it('answers the window it serves, however the origin is spelled', async () => {
    const { ask } = install();
    // Chromium writes the origin with a trailing slash, and an empty answer is
    // reported to the person sharing as 'Invalid capture constraints'.
    expect((await ask('http://localhost:5173/'))?.video?.id).toBe('screen:0:0');
    expect((await ask('http://localhost:5173'))?.video?.id).toBe('screen:0:0');
    expect((await ask('file:///'))?.video?.id).toBe('screen:0:0');
  });

  it('gives a page from anywhere else nothing to capture', async () => {
    const { ask } = install();
    expect(await ask('https://example.com/')).toEqual({});
    expect(await ask('http://localhost:6006/')).toEqual({});
  });

  it('hands over the screen that was chosen, once', async () => {
    const { service, ask } = install();
    service.selectSource('screen:1:0');
    expect((await ask('file://'))?.video?.id).toBe('screen:1:0');
    // The choice belongs to the request it was made for; the next one starts
    // from the first screen again rather than a stale preference.
    expect((await ask('file://'))?.video?.id).toBe('screen:0:0');
  });

  it('refuses to capture anything but a whole screen', () => {
    const { service } = install();
    expect(() => service.selectSource('window:12:0')).toThrow();
  });
});
