import { test, expect } from '@playwright/test';
import { pixelAt } from './helpers/pixels';

// Patch 1 · G2 (+ Patch 2 · B2): O opens the Overview, nodes are drawn, Esc closes it.
test('the Overview opens with O, draws the library, and closes with Esc', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/?seed=demo', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);

  await page.keyboard.press('o');
  const overview = page.getByTestId('overview');
  await expect(overview).toBeVisible();
  await page.waitForTimeout(1500);

  // Nodes are drawn: somewhere in the middle band the pixels are not the plain background.
  const bg = [0x17, 0x0b, 0x1c];
  let drawn = false;
  for (let x = 300; x < 1000 && !drawn; x += 24) {
    for (let y = 250; y < 600 && !drawn; y += 24) {
      const c = await pixelAt(page, x, y);
      if (c.some((v, i) => Math.abs(v - bg[i]) > 12)) drawn = true;
    }
  }
  expect(drawn).toBe(true);

  // It opens on Clusters (Patch 2 · B2); the Spacing slider keeps it open and redraws.
  await expect(page.getByRole('tab', { name: 'Clusters' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  const spacing = page.getByRole('slider', { name: 'Spacing' });
  await spacing.focus();
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(800);
  await expect(overview).toBeVisible();

  await page.getByRole('tab', { name: 'My layout' }).click();
  await page.waitForTimeout(500);
  await page.keyboard.press('Escape');
  await expect(overview).toBeHidden();

  // The minimap's expand button opens it too.
  await page.getByRole('button', { name: 'Open the Overview (O)' }).click();
  await expect(overview).toBeVisible();
});
