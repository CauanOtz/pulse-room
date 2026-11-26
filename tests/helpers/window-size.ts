import { expect, type ElectronApplication, type Page } from '@playwright/test';

/**
 * Gives the window a new inner size and waits until the page has its width.
 *
 * The test window shares the desktop with whatever else is open, and Windows
 * can minimise or maximise it meanwhile. Restoring it is not immediate: a size
 * set straight after `restore()` or `unmaximize()` is overwritten when the
 * restore lands, with the size the window had before. So each look at the page
 * first brings the window back to a normal state, and sets the size again only
 * once it is normal and still wrong, until the page reports what was asked.
 */
export async function resizeWindow(
  application: ElectronApplication,
  page: Page,
  width: number,
  height: number,
): Promise<void> {
  await expect
    .poll(
      async () => {
        await application.evaluate(
          ({ BrowserWindow }, [wanted, tall]) => {
            const current = BrowserWindow.getAllWindows()[0]!;
            if (current.isFullScreen()) current.setFullScreen(false);
            else if (current.isMinimized()) current.restore();
            else if (current.isMaximized()) current.unmaximize();
            else {
              const [nowWide] = current.getContentSize();
              if (nowWide !== wanted) current.setContentSize(wanted!, tall!);
            }
          },
          [width, height],
        );
        // The width is what is checked: a height taller than the screen may be cut to fit it.
        return page.evaluate(() => innerWidth);
      },
      { timeout: 15_000, intervals: [100, 250, 500] },
    )
    .toBe(width);
}
