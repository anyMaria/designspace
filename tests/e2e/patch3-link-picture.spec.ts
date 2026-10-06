import { test, expect } from '@playwright/test';

// Patch 3 · B3: a link with no picture says so; you can give it one, and undo that.
test('a link without a picture says so, takes a picture from a file, and Ctrl+Z puts it back', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);

  await page.keyboard.press('Control+l');
  await page.getByPlaceholder('https://example.com').fill('https://example.com/article');
  await page.getByRole('dialog').getByRole('button', { name: 'Add', exact: true }).click();

  await page.getByRole('tab', { name: 'List' }).click();
  const tile = page.locator('button.ds-list-tile');
  await expect(tile).toHaveCount(1);
  await expect(page.getByTestId('link-no-picture')).toBeVisible();

  // Select it: Details has the picture box.
  await tile.click();
  const box = page.getByTestId('link-picture-box');
  await expect(box).toBeVisible();
  await expect(box.getByText('No picture found')).toBeVisible();

  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Choose a picture…' }).click();
  await (await chooser).setFiles('tests/e2e/fixtures/wide-circle.png');

  // The picture arrives once it is made into thumbnails.
  await expect(box.locator('img')).toBeVisible({ timeout: 30_000 });
  await expect(box.getByText('No picture found')).toBeHidden();

  await page.getByTestId('details-kind').click();
  await page.keyboard.press('Control+z');
  await expect(box.getByText('No picture found')).toBeVisible();
});
