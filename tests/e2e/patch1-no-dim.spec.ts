import { test, expect } from '@playwright/test';
import { near, pixelAt, waitForPixel } from './helpers/pixels';

// Patch 1 · A8: selecting an unclassified item must not fade the rest of the map.
// At start the camera puts world (0, 0) at the canvas centre at 100 %. Demo item 0 ("BAUHAUS 1",
// world 0,0–320,400) has an amber circle around card point (160, 173); item 1 (world
// 400,0–720,400) has a sage rectangle around card point (160, 160).
test('selecting an unclassified item does not dim the other cards', async ({ page }) => {
  await page.goto('/?seed=demo');
  const box = await page.locator('canvas').first().boundingBox();
  if (!box) throw new Error('canvas has no bounding box');
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;

  await page.keyboard.press('l'); // close the right panel (item 1 is under it otherwise)

  const p0: [number, number] = [cx + 160, cy + 173];
  const p1: [number, number] = [cx + 560, cy + 160];
  await waitForPixel(page, p0[0], p0[1], (c) => near(c, [233, 168, 69], 40), 60_000);
  await waitForPixel(page, p1[0], p1[1], (c) => near(c, [147, 184, 157], 40), 60_000);

  const before = await pixelAt(page, p1[0], p1[1]);
  await page.mouse.click(p0[0], p0[1]);
  await page.waitForTimeout(500);
  const after = await pixelAt(page, p1[0], p1[1]);

  expect(near(after, before, 10), `${before.join(',')} -> ${after.join(',')}`).toBe(true);
});
