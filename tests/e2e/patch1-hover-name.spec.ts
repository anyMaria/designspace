import { test, expect } from '@playwright/test';

// Patch 1 · B3: resting on a card shows its name under it; leaving hides it at once.
test('hovering a card shows its name, and leaving hides it', async ({ page }) => {
  await page.goto('/?seed=demo');
  const box = await page.locator('canvas').first().boundingBox();
  if (!box) throw new Error('canvas has no bounding box');
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;

  // Demo item 0 ("BAUHAUS 1") spans world 0,0–320,400; the camera starts with world 0,0 centred.
  await page.mouse.move(cx + 160, cy + 173);
  await page.waitForTimeout(600);
  await expect(page.getByTestId('hover-name')).toHaveText('BAUHAUS 1');

  await page.mouse.move(5, 5);
  await expect(page.getByTestId('hover-name')).toHaveCount(0);
});
