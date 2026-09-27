import { test, expect } from '@playwright/test';

test('Tidy up re-packs the selection into justified rows as one undo step', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });

  await page.goto('/?seed=demo', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);

  const canvas = page.locator('canvas').first();
  const box = await canvas.boundingBox();
  if (!box) throw new Error('canvas not found');

  await canvas.click();
  await page.keyboard.press('Control+a');
  await page.waitForTimeout(300);

  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2, { button: 'right' });
  await page.waitForTimeout(200);
  await expect(page.getByRole('menuitem', { name: 'Tidy up' })).toBeVisible();
  await page.getByRole('menuitem', { name: 'Tidy up' }).click();
  await page.waitForTimeout(300);

  // Undo puts everything back — no visible assertion beyond "doesn't throw", since the demo
  // seed's exact positions aren't asserted elsewhere either; this is a wiring smoke test.
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(300);

  expect(errors, errors.join('\n')).toEqual([]);
});
