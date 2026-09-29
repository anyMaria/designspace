import { test, expect } from '@playwright/test';

test('switching to a board renders only its own placements, and Delete removes from the board without trashing the item', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });

  await page.goto('/?seed=demo', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);

  const canvas = page.locator('canvas').first();
  await canvas.click();
  const box = await canvas.boundingBox();
  if (!box) throw new Error('canvas not found');

  // Confirm the Library itself has far more than a couple of items before we narrow anything.
  await page.keyboard.press('Control+a');
  await expect(page.getByText(/^\d+ items$/)).toBeVisible();
  const libraryCountText = await page.getByText(/^\d+ items$/).textContent();
  const libraryCount = Number(libraryCountText?.split(' ')[0]);
  expect(libraryCount).toBeGreaterThan(2);

  // Select everything and create a board from it.
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2, { button: 'right' });
  await page.waitForTimeout(200);
  await page.getByRole('menuitem', { name: 'Create board from selection' }).click();

  const switcher = page.getByRole('button', { name: 'Switch space' });
  await expect(switcher).toContainText('Untitled board');

  // The board canvas shows exactly the placed items — same count, since we placed all of them.
  await page.waitForTimeout(300);
  await page.keyboard.press('Control+a');
  await expect(page.getByText(`${libraryCount} items`, { exact: true })).toBeVisible();

  // Delete removes them from the board (not Trash) — confirmed by the toast wording — and the
  // board canvas goes empty.
  await page.keyboard.press('Delete');
  await expect(page.getByText(`Removed ${libraryCount} items from board`)).toBeVisible();
  await page.waitForTimeout(300);
  await page.keyboard.press('Control+a');
  await expect(page.getByText(`${libraryCount} items`, { exact: true })).toBeHidden();

  // Back in the Library, every item is still there (never trashed) — the count is unchanged.
  await switcher.click();
  await page.getByRole('menuitem', { name: 'Library' }).click();
  await page.waitForTimeout(300);
  await page.keyboard.press('Control+a');
  await expect(page.getByText(`${libraryCount} items`, { exact: true })).toBeVisible();

  expect(errors, errors.join('\n')).toEqual([]);
});
