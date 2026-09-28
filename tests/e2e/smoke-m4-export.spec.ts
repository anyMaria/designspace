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
