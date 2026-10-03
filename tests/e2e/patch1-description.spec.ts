import { test, expect } from '@playwright/test';

// Patch 1 · E: hover a photo, open the thought bubble, write a description, find it again.
test('a description written in the bubble panel persists and is searchable', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/?seed=demo', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  await page.keyboard.press('l'); // close the right panel
  const box = await page.locator('canvas').first().boundingBox();
  if (!box) throw new Error('canvas has no bounding box');
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;

  // Demo item 0 spans world 0,0–320,400 (camera starts with world 0,0 centred).
  await page.mouse.move(cx + 160, cy + 173);
  const bubble = page.getByTestId('thought-bubble');
  await expect(bubble).toBeVisible();
  await expect(bubble).toHaveAttribute('data-has-description', 'false');
  await bubble.click();

  const panel = page.getByTestId('description-panel');
  await expect(panel).toBeVisible();
  await page.keyboard.type('Zephyrine blue gradient with a #dig-into note');
  await page.keyboard.press('Escape');
  await expect(panel).toBeHidden();

  await page.mouse.move(5, 5);
  await page.mouse.move(cx + 160, cy + 173);
  await expect(page.getByTestId('thought-bubble')).toHaveAttribute('data-has-description', 'true');

  // It survives a reload and is found by a word that is only in the description.
  await page.goto('/', { waitUntil: 'networkidle' }); // no ?seed: the stored library, not a fresh demo
  await page.waitForTimeout(1500);
  await page.keyboard.press('Control+k');
  await page.getByPlaceholder('Search your library…').fill('zephyrine');
  await page.waitForTimeout(500);
  await expect(page.getByText(/^1 of \d+$/)).toBeVisible();
});
