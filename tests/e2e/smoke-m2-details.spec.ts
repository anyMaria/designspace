import { test, expect } from '@playwright/test';

test('the Details panel classifies a selected item: Type, Vibe, Favorite', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });

  await page.goto('/?seed=demo', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);

  const canvas = page.locator('canvas').first();
  const box = await canvas.boundingBox();
  if (!box) throw new Error('canvas not found');

  // Select an item — the panel should switch to Details automatically.
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForTimeout(300);
  await expect(page.getByRole('tab', { name: 'Details' })).toHaveAttribute('aria-selected', 'true');
  await page.screenshot({ path: 'test-results/details-panel.png' });

  // Set a Type via chip click.
  await page.getByRole('button', { name: 'Poster' }).first().click();
  await page.waitForTimeout(200);

  // Vibe: focusing the field lists the existing words (most used first); Enter adds the highlighted
  // one. Typing a near-miss marks the closest word "Did you mean?" (Patch 2 · D).
  const vibeInput = page.getByRole('combobox', { name: 'Vibe' });
  await vibeInput.focus();
  const vibeList = page.getByRole('listbox', { name: 'Vibe' });
  await expect(vibeList.getByRole('option', { name: /Dreamy/ })).toBeVisible();
  await vibeInput.fill('dremy');
  await expect(vibeList.getByRole('option').first()).toContainText('Did you mean?');
  await vibeInput.press('Enter');
  await expect(page.locator('.ds-chip', { hasText: 'Dreamy' })).toBeVisible();

  // Each word field has its own words: Movement lists Art Nouveau, never Vibe's Bold.
  const movementInput = page.getByRole('combobox', { name: 'Movement' });
  await movementInput.focus();
  const movementList = page.getByRole('listbox', { name: 'Movement' });
  await expect(movementList.getByRole('option', { name: /Art Nouveau/ })).toBeVisible();
  await expect(movementList.getByRole('option', { name: /Bold/ })).toHaveCount(0);

  // Leaving a field never makes a word: type something new, click elsewhere, nothing is added.
  await movementInput.fill('Brandnewmovement');
  await page.getByText('Movement', { exact: true }).first().click();
  await expect(page.locator('.ds-chip', { hasText: 'Brandnewmovement' })).toHaveCount(0);

  // Toggle favorite.
  await page.getByRole('switch', { name: 'Favorite' }).click();
  await page.waitForTimeout(200);

  // The context menu now offers to remove it from the favourites (Patch 2 · C6).
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2, { button: 'right' });
  await expect(page.getByRole('menuitem', { name: 'Remove from favorites' })).toBeVisible();
  await page.keyboard.press('Escape');

  await page.screenshot({ path: 'test-results/details-panel-classified.png' });

  expect(errors, errors.join('\n')).toEqual([]);
});
