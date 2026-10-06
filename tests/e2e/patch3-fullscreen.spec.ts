import { test, expect } from '@playwright/test';

// Patch 3 · A2: in full screen, one Esc (with nothing open) leaves it even though a card is
// selected, and a focused text field gives up focus on the way.
test('Esc leaves full screen, keeping the selection', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/?seed=demo&fakeFullscreen', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);

  await page.getByRole('button', { name: 'Full screen' }).click();
  await expect(page.getByRole('button', { name: 'Exit full screen' }).first()).toBeVisible();
  await expect(page.getByTestId('fullscreen-exit-pill')).toHaveCSS('opacity', '1');

  // Select a card by clicking the first List tile.
  const tile = page.locator('button.ds-list-tile').first();
  await tile.click();
  await expect(page.getByRole('tab', { name: 'Details' })).toHaveAttribute('aria-selected', 'true');

  // Focus the Title field, then press Esc twice: the field, then full screen.
  const title = page.getByLabel('Title').first();
  await title.focus();
  await page.keyboard.press('Escape');
  await expect(title).not.toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Full screen', exact: true })).toBeVisible();
  // The card stays selected.
  await expect(page.getByRole('tab', { name: 'Details' })).toHaveAttribute('aria-selected', 'true');
});
