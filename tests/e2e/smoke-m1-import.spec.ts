import { test, expect } from '@playwright/test';

test('the + Add menu opens and Files… imports an image onto the canvas', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });

  await page.goto('/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);

  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await page.screenshot({ path: 'test-results/import-menu-open.png' });
  await expect(page.getByRole('menuitem', { name: 'Files…' })).toBeVisible();

  const fileChooserPromise = page.waitForEvent('filechooser');
  await page.getByRole('menuitem', { name: 'Files…' }).click();
  const chooser = await fileChooserPromise;
  await chooser.setFiles('tests/e2e/fixtures/red-square.png');

  await page.waitForTimeout(2500);
  await page.screenshot({ path: 'test-results/import-after-files.png' });

  expect(errors, errors.join('\n')).toEqual([]);
});
