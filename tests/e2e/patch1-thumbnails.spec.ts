import { test } from '@playwright/test';
import { near, pixelAt, waitForPixel } from './helpers/pixels';

// Patch 1 · A3: a thumbnail that finishes while its card is already on screen must appear
// without panning. wide-circle.png is 800×400 with a (240,180,60) circle in the middle.
test('an imported picture appears on screen without panning', async ({ page }) => {
  await page.goto('/');
  const box = await page.locator('canvas').first().boundingBox();
  if (!box) throw new Error('canvas has no bounding box');
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;

  await page
    .locator('input[type=file]')
    .first()
    .setInputFiles('tests/e2e/fixtures/wide-circle.png');
  await page.keyboard.press('Escape');
  await page.mouse.move(5, 5);

  await waitForPixel(page, cx, cy, (c) => near(c, [240, 180, 60], 40), 30_000);

  // A4: the card is 320×160 (the picture's shape), not a squashed 320×320 square. 128 px below
  // the centre is inside a square card but outside the correct one.
  const below = await pixelAt(page, cx, cy + 128);
  if (below.some((v) => v >= 70)) throw new Error(`card still looks square: ${below.join(',')}`);
});
