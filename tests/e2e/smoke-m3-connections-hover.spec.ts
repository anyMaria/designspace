import { test, expect } from '@playwright/test';

test('hovering a classified item runs the connections scoring/dim/line pipeline without errors', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });

  await page.goto('/?seed=demo', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);

  // Give every seeded item the same Vibe via a bulk edit, so hovering any one of them has real
  // shared-value candidates to score and draw lines to — not just an empty-result no-op.
  const canvas = page.locator('canvas').first();
  await canvas.click();
  await page.keyboard.press('Control+a');
  await page.waitForTimeout(300);
  await page.getByPlaceholder('Add a vibe…').fill('Dreamy');
  await page.getByPlaceholder('Add a vibe…').press('Enter'); // Dreamy exists: Enter adds it
  await page.waitForTimeout(300);

  // Deselect (Esc), then hover the item at canvas center and wait past the 300ms hover delay.
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  const box = await canvas.boundingBox();
  if (!box) throw new Error('canvas not found');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForTimeout(600);
  await page.mouse.move(box.x + box.width / 2 + 5, box.y + box.height / 2 + 5); // jiggle to re-trigger hover
  await page.waitForTimeout(600);
  await page.screenshot({ path: 'test-results/connections-hover.png' });

  expect(errors, errors.join('\n')).toEqual([]);
});
