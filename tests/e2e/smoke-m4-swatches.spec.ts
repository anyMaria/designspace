import { test, expect } from '@playwright/test';

test('the Add menu creates a swatch (click copies its HEX), and Extract palette turns a selection into swatches', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });

  await page.goto('/?seed=demo', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);

  // Add menu → Swatch creates a default-grey swatch and selects nothing new automatically, so
  // click it once to select (and copy its HEX).
  await page.getByRole('button', { name: 'Add' }).click();
  await page.getByRole('menuitem', { name: 'Swatch', exact: true }).click();
  await page.waitForTimeout(300);

  const canvas = page.locator('canvas').first();
  const box = await canvas.boundingBox();
  if (!box) throw new Error('canvas not found');
  const center = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  await page.mouse.click(center.x, center.y);
  await expect(page.getByText('Copied #8c8c8c')).toBeVisible();

  // The Details panel shows the Color field for the selected swatch.
  await expect(page.getByLabel('Color', { exact: true })).toHaveValue('#8c8c8c');

  // Right-click a real image, Extract palette.
  await page.keyboard.press('l');
  await page.waitForTimeout(200);
  const item0 = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  await page.mouse.click(item0.x, item0.y, { button: 'right' });
  await page.waitForTimeout(200);
  await page.getByRole('menuitem', { name: 'Extract palette' }).click();
  await expect(page.getByText(/^Extracted \d+ swatches$/)).toBeVisible();

  expect(errors, errors.join('\n')).toEqual([]);
});
