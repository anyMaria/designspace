import { test, expect } from '@playwright/test';

test('importing a font shows a specimen thumbnail, and Focus view opens the type tester', async ({
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
  await chooser.setFiles('tests/e2e/fixtures/sample.woff2');

  // Font ingest runs on the main thread (parsing + a FontFace + canvas specimen render).
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

  // The type tester: metadata panel shows the real family name from the font's name table, the
  // sample-text input is editable and drives the size waterfall / glyph grid live.
  await expect(page.getByText('Unbounded', { exact: true }).first()).toBeVisible();
  const sampleInput = page.getByLabel('Sample text');
  await expect(sampleInput).toBeVisible();
  await sampleInput.fill('Hello type');
  await expect(page.getByText('Hello type').first()).toBeVisible();

  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  await expect(sampleInput).toBeHidden();

  expect(errors, errors.join('\n')).toEqual([]);
});
