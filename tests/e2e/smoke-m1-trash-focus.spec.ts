import { test, expect } from '@playwright/test';

test('trash + restore + Focus view all work against the seeded demo library', async ({ page }) => {
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

  // Focus view: double-click an item, confirm the overlay opens, Esc closes it.
  await page.mouse.dblclick(box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForTimeout(300);
  await expect(page.getByRole('button', { name: 'Close' })).toBeVisible();
  await page.screenshot({ path: 'test-results/focus-view.png' });
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  await expect(page.getByRole('button', { name: 'Close' })).not.toBeVisible();

  // Trash: select the item, Delete, confirm the toast, then check it in Settings → Library → Trash.
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForTimeout(200);
  await page.keyboard.press('Delete');
  await page.waitForTimeout(300);
  await expect(page.getByText('Moved to Trash')).toBeVisible();

  await page.getByRole('button', { name: 'Settings' }).click();
  await page.getByRole('button', { name: 'Library' }).click();
  await page.waitForTimeout(300);
  await expect(page.getByRole('heading', { name: 'Trash' })).toBeVisible();
  await page.screenshot({ path: 'test-results/trash-section.png' });
  await expect(page.getByRole('button', { name: 'Restore' })).toBeVisible();

  await page.getByRole('button', { name: 'Restore' }).click();
  await page.waitForTimeout(300);
  await expect(page.getByText('Trash is empty.')).toBeVisible();

  expect(errors, errors.join('\n')).toEqual([]);
});
