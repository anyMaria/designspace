import { test, expect } from '@playwright/test';

// Patch 1 · C / Patch 2 · E7: a palette is made in the Color studio; the Details panel shows a
// compact view with "Open in Color studio".
test('a palette made in the studio opens from Details', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });

  await page.goto('/', { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Palette…', exact: true }).click();
  const studio = page.getByRole('dialog', { name: 'Color studio' });
  await expect(studio).toBeVisible();
  await studio.getByRole('button', { name: 'Save palette' }).click();
  await expect(studio).toBeHidden();

  // The new palette is selected: five colour cells, and the studio opens from Details.
  await expect(page.getByRole('listitem')).toHaveCount(5);
  await page.getByRole('button', { name: 'Open in Color studio' }).click();
  await expect(studio).toBeVisible();

  expect(errors, errors.join('\n')).toEqual([]);
});

test('three palettes combine into one palette, and Ctrl+Z splits them again', async ({ page }) => {
  await page.goto('/', { waitUntil: 'networkidle' });
  const box = await page.locator('canvas').first().boundingBox();
  if (!box) throw new Error('canvas has no bounding box');
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;

  for (let i = 0; i < 3; i++) {
    await page.getByRole('button', { name: 'Add', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Palette…', exact: true }).click();
    await page
      .getByRole('dialog', { name: 'Color studio' })
      .getByRole('button', { name: 'Save palette' })
      .click();
    await page.waitForTimeout(300);
  }
  await page.mouse.click(cx - 450, cy - 250); // empty canvas: focus the map and deselect
  await page.keyboard.press('Control+a');
  await page.mouse.click(cx, cy, { button: 'right' }); // the first swatch is centred
  await page.getByRole('menuitem', { name: 'Combine into palette' }).click();
  await expect(page.getByText('Combined 15 swatches into a palette')).toBeVisible();

  // One palette now: Ctrl+A selects a single item, whose view shows all 15 colours.
  await page.mouse.click(cx - 450, cy - 250);
  await page.keyboard.press('Control+a');
  await expect(page.getByRole('listitem')).toHaveCount(15);

  await page.mouse.click(cx - 450, cy - 250);
  await page.keyboard.press('Control+z');
  await page.keyboard.press('Control+a');
  await expect(page.getByText('3 items', { exact: true })).toBeVisible();
});
