import { test, expect } from '@playwright/test';

// Patch 3 · B2: the description is written right in Details, with no zoom and no panel.
test('a description typed in Details is saved, persists, and Ctrl+Z undoes it', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/');
  await page
    .locator('input[type=file]')
    .first()
    .setInputFiles('tests/e2e/fixtures/wide-circle.png');
  await page.waitForTimeout(2500); // let the picture finish ingesting

  // The import selects the picture, so Details is showing.
  const field = page.getByTestId('inline-description');
  await expect(field).toBeVisible();
  await field.getByText('Add a description…').click();
  await page.keyboard.type('Quiet blue circle');
  // Click elsewhere in the panel to leave the field.
  await page.getByTestId('details-kind').click();
  await expect(page.getByTestId('description-panel')).toBeHidden();

  // Persisted: wait for the debounced save, then reload and search for it.
  await page.waitForTimeout(2500);
  await page.reload();
  await expect(page.getByRole('button', { name: 'Add', exact: true })).toBeVisible();
  await page.waitForTimeout(1500);
  await page.keyboard.press('Control+k');
  await page.getByPlaceholder('Search your library…').fill('quiet');
  await expect(page.getByText(/^1 of 1$/)).toBeVisible({ timeout: 15_000 });
  await page.keyboard.press('Escape');

  // Ctrl+Z (focus on the map) removes the description again.
  await page.mouse.click(640, 650);
  await page.locator('button.ds-list-tile').first().click();
  await expect(page.getByTestId('inline-description')).toContainText('Quiet blue circle');
  await page.mouse.click(640, 700);
  await page.keyboard.press('Control+z');
  await expect(page.getByTestId('inline-description')).not.toContainText('Quiet blue circle');
});
