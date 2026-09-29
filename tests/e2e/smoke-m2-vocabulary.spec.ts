import { test, expect } from '@playwright/test';

test('the vocabulary manager renders starter values and can rename/reorder/delete', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });

  await page.goto('/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);

  await page.getByRole('button', { name: 'Settings' }).click();
  await page.getByRole('button', { name: 'Vocabularies', exact: true }).click();
  await page.waitForTimeout(300);

  // Type tab is selected by default, showing the 21 starter types.
  await expect(page.getByRole('textbox', { name: 'Name: Poster' })).toBeVisible();
  await page.screenshot({ path: 'test-results/vocab-type.png' });

  // Switch to Movement, which has AI-hinted entries.
  await page.getByRole('tab', { name: 'Movement' }).click();
  await page.waitForTimeout(200);
  await expect(page.getByRole('textbox', { name: 'Name: Bauhaus' })).toBeVisible();
  await expect(page.getByPlaceholder('AI hint (optional)').first()).toBeVisible();
  await page.screenshot({ path: 'test-results/vocab-movement.png' });

  // Rename a value.
  const nameField = page.getByRole('textbox', { name: 'Name: Bauhaus' });
  await nameField.fill('Bauhaus (renamed)');
  await nameField.blur();
  await page.waitForTimeout(200);
  await expect(page.getByRole('textbox', { name: 'Name: Bauhaus (renamed)' })).toBeVisible();

  // Reorder: move the first item down.
  await page.getByRole('button', { name: 'Move down' }).first().click();
  await page.waitForTimeout(200);

  // Delete a value (confirm dialog auto-accepted).
  page.once('dialog', (d) => void d.accept());
  await page.getByRole('button', { name: 'Delete' }).first().click();
  await page.waitForTimeout(200);

  expect(errors, errors.join('\n')).toEqual([]);
});
