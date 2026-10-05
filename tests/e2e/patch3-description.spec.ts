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

  const field = page.getByTestId('inline-description');
  await expect(field).toBeVisible();
  await expect(field).toContainText('Add a description…');
  await field.locator('.ProseMirror').click();
  await page.keyboard.type('Quiet blue circle');
  // Click elsewhere in the panel to leave the field.
  await page.getByTestId('details-kind').click();
  await expect(page.getByTestId('description-panel')).toBeHidden();

  // Ctrl+Z (focus out of the field) removes the description; redo brings it back.
  await expect(page.getByTestId('description-panel')).toBeHidden();
  await page.keyboard.press('Control+z');
  await expect(page.getByTestId('inline-description')).not.toContainText('Quiet blue circle');
  await page.keyboard.press('Control+Shift+z');
  await expect(page.getByTestId('inline-description')).toContainText('Quiet blue circle');

  // Persisted: wait for the debounced save, then reload and search for it.
  await page.waitForTimeout(2500);
  await page.reload();
  await expect(page.getByRole('button', { name: 'Add', exact: true })).toBeVisible();
  await page.waitForTimeout(1500);
  await page.keyboard.press('Control+k');
  await page.getByPlaceholder('Search your library…').fill('quiet');
  await expect(page.getByText(/^1 of 1$/)).toBeVisible({ timeout: 15_000 });
});
