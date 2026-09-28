import { test, expect } from '@playwright/test';

test('importing a PDF shows a thumbnail once ingest finishes, and Focus view pages through it', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });

  await page.goto('/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);

  const fileChooserPromise = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Files…' }).click();
  const chooser = await fileChooserPromise;
  await chooser.setFiles('tests/e2e/fixtures/sample.pdf');

  // PDF ingest runs on the main thread (rasterizing a page needs a canvas) — give it room.
  await page.waitForTimeout(3000);

  await page.getByRole('tab', { name: 'List' }).click();
  const tile = page.locator('button.ds-list-tile');
  await expect(tile).toHaveCount(1);
  await expect(tile.locator('img')).toBeVisible();

  const canvas = page.locator('canvas').first();
  const box = await canvas.boundingBox();
  if (!box) throw new Error('canvas not found');
  await page.mouse.dblclick(box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForTimeout(500);

  // Focus view's PDF page canvas plus its "Page 1 of 3" nav label.
  await expect(page.getByText('Page 1 of 3')).toBeVisible();

  await page.getByRole('button', { name: 'Next page' }).click();
  await expect(page.getByText('Page 2 of 3')).toBeVisible();

  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  await expect(page.getByText('Page 2 of 3')).toBeHidden();

  expect(errors, errors.join('\n')).toEqual([]);
});
