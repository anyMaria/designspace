import { test, expect } from '@playwright/test';

test('the Export dialog renders the Library map to a non-empty PNG download', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });

  await page.goto('/?seed=demo', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);

  await page.getByRole('button', { name: 'Export…' }).first().click();
  const dialog = page.getByRole('dialog', { name: 'Export' });
  await expect(dialog).toBeVisible();

  const downloadPromise = page.waitForEvent('download');
  await dialog.getByRole('button', { name: 'Export…' }).click();
  const download = await downloadPromise;

  expect(download.suggestedFilename()).toBe('Library.png');
  const downloadPath = await download.path();
  expect(downloadPath, 'the PNG should have saved to disk').toBeTruthy();

  await expect(dialog).toBeHidden();
  expect(errors, errors.join('\n')).toEqual([]);
});

test('Export → Selection renders just the selected items', async ({ page }) => {
  await page.goto('/?seed=demo');
  await page.waitForTimeout(2500);

  // Select two items with a shift-click, then export with "Selection".
  const canvas = page.locator('canvas').first();
  const box = await canvas.boundingBox();
  if (!box) throw new Error('canvas not found');
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await page.keyboard.down('Shift');
  await page.mouse.click(box.x + box.width / 2 + 330, box.y + box.height / 2);
  await page.keyboard.up('Shift');
  await page.mouse.move(box.x + 5, box.y + box.height - 5);

  await page.getByRole('button', { name: 'Export…' }).first().click();
  const dialog = page.getByRole('dialog', { name: 'Export' });
  await expect(dialog.getByRole('tab', { name: /^Selection \(\d+\)$/ })).toHaveAttribute(
    'aria-selected',
    'true',
  );

  const downloadPromise = page.waitForEvent('download');
  await dialog.getByRole('button', { name: 'Export…' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('Library (selection).png');
  expect(await download.path()).toBeTruthy();
});
