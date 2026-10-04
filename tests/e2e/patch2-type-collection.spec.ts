import { test, expect } from '@playwright/test';

// Patch 2 · F3 + F5: fonts of one family become one card; families group into a type collection.
test.use({ viewport: { width: 1800, height: 900 } });

test('two Urbanist files make one card, and two families make a type collection', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });

  await page.goto('/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);

  const chooserPromise = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Files…' }).click();
  const chooser = await chooserPromise;
  await chooser.setFiles([
    'tests/e2e/fixtures/Urbanist-VariableFont_wght.ttf',
    'tests/e2e/fixtures/Urbanist-Italic-VariableFont_wght.ttf',
    'tests/e2e/fixtures/sample.woff2',
  ]);
  await page.waitForTimeout(4000);

  // Two cards: one "Urbanist" family (two files) and "Unbounded".
  await page.getByRole('tab', { name: 'List' }).click();
  await expect(page.locator('button.ds-list-tile')).toHaveCount(2);
  await page.getByRole('tab', { name: 'Details' }).click();

  const canvas = page.locator('canvas').first();
  const box = await canvas.boundingBox();
  if (!box) throw new Error('canvas not found');
  // The two new cards are selected after the import.
  // The two cards sit left and right of the centre: right-click the left one.
  await page.mouse.click(box.x + box.width / 2 - 256, box.y + box.height / 2, { button: 'right' });
  await page.getByRole('menuitem', { name: 'Make a type collection' }).click();

  await page.getByRole('tab', { name: 'List' }).click();
  await expect(page.getByText('2 families')).toBeVisible();
  await page.screenshot({ path: 'test-results/type-collection.png' });

  expect(errors, errors.join('\n')).toEqual([]);
});
