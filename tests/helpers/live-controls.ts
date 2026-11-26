import { expect, type Locator, type Page } from '@playwright/test';

/**
 * Puts the real pointer on a control of a live's bars, the way a viewer
 * reaches for it.
 *
 * The bars step aside 2.6 seconds after the pointer stops, and while they are
 * away they let the pointer through. Waking them with one move and then asking
 * Playwright to click races that timer: on a slow machine the bars are gone
 * again before the click, and Playwright waits for a button that only a mouse
 * move can bring back. Here the first move wakes them, and the second lands on
 * them once they take the pointer again, which holds them for as long as it
 * stays. The control can then be clicked or hovered without a timer running.
 */
export async function reachLiveControl(page: Page, control: Locator): Promise<Locator> {
  // Drawn and placed even while faded out, so its place is known before it shows.
  await expect.poll(async () => (await control.boundingBox()) !== null).toBe(true);
  const box = (await control.boundingBox())!;
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y - 2);
  await expect(page.locator('.stage-live .live-toolbar').first()).not.toHaveClass(/is-hidden/);
  await page.mouse.move(x, y, { steps: 2 });
  return control;
}
