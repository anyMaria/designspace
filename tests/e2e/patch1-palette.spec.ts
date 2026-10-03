import { test, expect } from '@playwright/test';
import { near, waitForPixel } from './helpers/pixels';

// Patch 1 · C: a swatch is a palette with one colour; the editor in the Details panel changes
// its colours, each change is one undo step, and adding colours turns the card into two columns.
test('building a palette in the editor, and undoing it', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });

  await page.goto('/', { waitUntil: 'networkidle' });
  const box = await page.locator('canvas').first().boundingBox();
  if (!box) throw new Error('canvas has no bounding box');
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;

  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Swatch', exact: true }).click();

  // The new swatch is selected, so its editor is showing; make it red.
  const hex = page.getByLabel('Hex', { exact: true });
  await hex.fill('#ff0000');
  await hex.press('Enter');
  await waitForPixel(page, cx, cy, (c) => near(c, [255, 0, 0], 12), 10_000);

  // A second colour makes it a two-column palette (216 wide: the new cell sits right of centre).
  await page.getByRole('button', { name: 'Add color' }).click();
  await hex.fill('#0000ff');
  await hex.press('Enter');
  await waitForPixel(page, cx + 80, cy - 30, (c) => near(c, [0, 0, 255], 12), 10_000);
  await waitForPixel(page, cx - 20, cy - 30, (c) => near(c, [255, 0, 0], 12), 10_000);

  // Undo the blue, then undo the second colour: back to one red swatch.
  await page.mouse.click(cx - 450, cy - 250); // empty canvas: leaves the hex field so Ctrl+Z reaches the map
  await page.keyboard.press('Control+z');
  await waitForPixel(page, cx + 80, cy - 30, (c) => near(c, [255, 0, 0], 12), 10_000);

  expect(errors, errors.join('\n')).toEqual([]);
});
