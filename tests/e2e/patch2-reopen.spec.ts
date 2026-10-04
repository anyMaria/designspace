import { test, type Page } from '@playwright/test';
import { near, waitForPixel } from './helpers/pixels';

// Patch 2: pictures still show after reopening the app. In the browser build a reload is the reopen.
// wide-circle.png is 800×400 with a (240,180,60) circle in the middle.
const CIRCLE: [number, number, number] = [240, 180, 60];

async function canvasCentre(page: Page): Promise<[number, number]> {
  const box = await page.locator('canvas').first().boundingBox();
  if (!box) throw new Error('canvas has no bounding box');
  return [box.x + box.width / 2, box.y + box.height / 2];
}

test('an imported picture still shows after reopening the app', async ({ page }) => {
  await page.goto('/');
  const [cx, cy] = await canvasCentre(page);
  await page
    .locator('input[type=file]')
    .first()
    .setInputFiles('tests/e2e/fixtures/wide-circle.png');
  await page.keyboard.press('Escape');
  await page.mouse.move(5, 5);
  await waitForPixel(page, cx, cy, (c) => near(c, CIRCLE, 40), 30_000);

  // The browser database is saved to IndexedDB, debounced, once writes pause.
  await page.waitForTimeout(2500);

  await page.reload();
  await page.locator('canvas').first().waitFor();
  const [cx2, cy2] = await canvasCentre(page);
  await page.mouse.move(5, 5);
  await waitForPixel(page, cx2, cy2, (c) => near(c, CIRCLE, 40), 30_000);
});
