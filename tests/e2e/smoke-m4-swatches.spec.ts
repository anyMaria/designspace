import { test, expect } from '@playwright/test';

test('the Add menu creates a swatch and clicking it copies its HEX', async ({ page }) => {
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
  await page.getByRole('menuitem', { name: 'Swatch', exact: true }).click();
  await page.waitForTimeout(300);

  const canvas = page.locator('canvas').first();
  const box = await canvas.boundingBox();
  if (!box) throw new Error('canvas not found');
  const center = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  await page.mouse.click(center.x, center.y);
  await expect(page.getByText('Copied #8c8c8c')).toBeVisible();

  // The Details panel shows the palette editor (Hex field) for the selected swatch.
  await expect(page.getByLabel('Hex', { exact: true })).toHaveValue('#8C8C8C');

  expect(errors, errors.join('\n')).toEqual([]);
});

test('Extract palette turns a right-clicked image into swatches', async ({ page }) => {
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
  await page.getByRole('menuitem', { name: 'Extract palette' }).click();
  await expect(page.getByText(/^Extracted a palette of \d+ colors$/)).toBeVisible();

  expect(errors, errors.join('\n')).toEqual([]);
});
