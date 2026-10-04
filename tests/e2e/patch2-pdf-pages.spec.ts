import { test, expect } from '@playwright/test';

// Patch 2 · G: choosing which pages of a PDF to add, and Split into pages…
test.use({ viewport: { width: 1800, height: 900 } });

async function addSamplePdf(page: import('@playwright/test').Page): Promise<void> {
  const chooserPromise = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Files…' }).click();
  const chooser = await chooserPromise;
  await chooser.setFiles('tests/e2e/fixtures/sample.pdf');
}

test('the page picker adds chosen pages as separate cards, and Undo removes them', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });

  await page.goto('/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  await addSamplePdf(page);

  const picker = page.getByRole('dialog', { name: /Which pages of/ });
  await expect(picker).toBeVisible();
  await expect(picker.getByTestId('pdf-page-tile')).toHaveCount(3);

  await picker.getByLabel('Pages to add').fill('1, 3');
  await expect(picker.getByText('2 of 3 selected')).toBeVisible();
  await picker.getByRole('button', { name: 'Add these 2 pages separately' }).click();
  await expect(picker).toBeHidden();

  await page.waitForTimeout(3000);
  await page.getByRole('tab', { name: 'List' }).click();
  await expect(page.locator('button.ds-list-tile')).toHaveCount(2);

  // Undo removes both (one step).
  const canvas = page.locator('canvas').first();
  const box = await canvas.boundingBox();
  if (!box) throw new Error('canvas not found');
  await page.mouse.click(box.x + 300, box.y + 150);
  await page.keyboard.press('Control+z');
  await expect(page.locator('button.ds-list-tile')).toHaveCount(0);

  expect(errors, errors.join('\n')).toEqual([]);
});

test('Cancel adds nothing, and the picker sits behind Esc', async ({ page }) => {
  await page.goto('/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  await addSamplePdf(page);
  const picker = page.getByRole('dialog', { name: /Which pages of/ });
  await expect(picker).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(picker).toBeHidden();
  await page.getByRole('tab', { name: 'List' }).click();
  await expect(page.locator('button.ds-list-tile')).toHaveCount(0);
});

test('Split into pages… in the viewer adds the chosen page next to the PDF', async ({ page }) => {
  await page.goto('/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  await addSamplePdf(page);
  await page.getByRole('button', { name: 'Add as one PDF' }).click();
  await page.waitForTimeout(3000);

  const canvas = page.locator('canvas').first();
  const box = await canvas.boundingBox();
  if (!box) throw new Error('canvas not found');
  await page.mouse.dblclick(box.x + box.width / 2, box.y + box.height / 2);
  await expect(page.getByText('Page 1 of 3')).toBeVisible();

  await page.getByRole('button', { name: 'Split into pages…' }).click();
  const picker = page.getByRole('dialog', { name: /Which pages of/ });
  await expect(picker).toBeVisible();
  await picker.getByTestId('pdf-page-tile').nth(1).click();
  await picker.getByRole('button', { name: 'Add 1 page' }).click();
  await expect(picker).toBeHidden();

  await page.waitForTimeout(3000);
  await page.keyboard.press('Escape'); // leave the viewer
  await page.getByRole('tab', { name: 'List' }).click();
  await expect(page.locator('button.ds-list-tile')).toHaveCount(2);
});
