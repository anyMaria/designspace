import { test, expect } from '@playwright/test';

test('the Add menu makes a palette in the Color studio and the Details panel shows it', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });

  // An empty library: new swatches land at the viewport centre only when it is free (B7).
  await page.goto('/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);

  // Add menu → Swatch creates a default-grey swatch and selects nothing new automatically, so
  // click it once to select (and copy its HEX).
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Palette…', exact: true }).click();
  await page
    .getByRole('dialog', { name: 'Color studio' })
    .getByRole('button', { name: 'Save palette' })
    .click();
  await page.waitForTimeout(300);

  const canvas = page.locator('canvas').first();
  const box = await canvas.boundingBox();
  if (!box) throw new Error('canvas not found');
  const center = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  await page.mouse.click(center.x, center.y);
  // (A palette copies nothing on select; clicking one of its cells copies that colour.)

  // The Details panel shows the compact palette view.
  await expect(page.getByRole('button', { name: 'Open in Color studio' })).toBeVisible();

  expect(errors, errors.join('\n')).toEqual([]);
});

test('Make a palette opens the Color studio on a right-clicked image', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });

  await page.goto('/?seed=demo', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  const box = await page.locator('canvas').first().boundingBox();
  if (!box) throw new Error('canvas not found');

  await page.keyboard.press('l');
  await page.waitForTimeout(200);
  const item0 = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  await page.mouse.click(item0.x, item0.y, { button: 'right' });
  await page.waitForTimeout(200);
  await page.getByRole('menuitem', { name: 'Make a palette' }).click();
  const studio = page.getByRole('dialog', { name: 'Color studio' });
  await expect(studio).toBeVisible();
  await expect(studio.getByRole('tab', { name: 'From an image', selected: true })).toBeVisible();

  expect(errors, errors.join('\n')).toEqual([]);
});
