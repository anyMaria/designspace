import { test, expect } from '@playwright/test';

// Patch 1 · E: hover a photo, open the thought bubble, write a description, find it again.
// Uses a one-picture library: the demo library keeps re-making previews for a long time, and the
// browser build only saves its database (to IndexedDB, debounced) when writes pause, so a reload
// right after would race with that. (The desktop app writes straight to SQLite.)
test('a description written in the bubble panel persists and is searchable', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
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
  await page.keyboard.press('l'); // close the right panel
  await page.waitForTimeout(2500); // let the picture finish ingesting

  // The single imported card is centred on the viewport centre.
  await page.mouse.move(cx, cy);
  const bubble = page.getByTestId('thought-bubble');
  await expect(bubble).toBeVisible();
  await expect(bubble).toHaveAttribute('data-has-description', 'false');
  await bubble.click();

  const panel = page.getByTestId('description-panel');
  await expect(panel).toBeVisible();
  await expect(panel.getByText('What do you see? Why does it matter?')).toBeVisible();
  await page.keyboard.type('Zephyrine blue gradient with a #dig-into note');
  // The placeholder goes away as soon as there is text.
  await expect(panel.getByText('What do you see? Why does it matter?')).toBeHidden();
  await page.keyboard.press('Escape');
  await expect(panel).toBeHidden();

  await page.mouse.move(5, 5);
  await page.mouse.move(cx, cy);
  await expect(page.getByTestId('thought-bubble')).toHaveAttribute('data-has-description', 'true');

  // Writes have stopped: give the debounced save a moment, then reload.
  await page.waitForTimeout(2000);
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Add', exact: true })).toBeVisible();
  await page.waitForTimeout(1500);
  await page.keyboard.press('Control+k');
  await page.getByPlaceholder('Search your library…').fill('zephyrine');
  await expect(page.getByText(/^1 of 1$/)).toBeVisible({ timeout: 15_000 });
});
