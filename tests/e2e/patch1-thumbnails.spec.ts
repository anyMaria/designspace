import { test } from '@playwright/test';
import { near, waitForPixel } from './helpers/pixels';

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
});
