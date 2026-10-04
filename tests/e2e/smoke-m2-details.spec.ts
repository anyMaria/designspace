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

  // Add a Vibe via the chip input.
  const vibeInput = page.getByPlaceholder('Add a vibe…');
  await vibeInput.fill('Dreamy');
  await vibeInput.press('Enter');
  await page.waitForTimeout(200);
  await expect(page.getByText('Dreamy', { exact: true })).toBeVisible();

  // Each word field has its own suggestions: Movement offers Art Nouveau, never Vibe's Dreamy.
  const movementInput = page.getByPlaceholder('Add a movement…');
  const listId = await movementInput.getAttribute('list');
  expect(listId).toBeTruthy();
  await expect(page.locator(`[id="${listId}"] option[value="Art Nouveau"]`)).toHaveCount(1);
  await expect(page.locator(`[id="${listId}"] option[value="Dreamy"]`)).toHaveCount(0);

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
