import { test, expect } from '@playwright/test';

test('Shift+C morphs the map into Constellations with a glowing hub, and "Back to my layout" restores it', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });

  await page.goto('/?seed=demo', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);

  // Give every seeded item the same Vibe, so Constellations has a real hub to arrange around
  // rather than dumping everything into the Unclassified ring.
  const canvas = page.locator('canvas').first();
  await canvas.click();
  await page.keyboard.press('Control+a');
  await page.waitForTimeout(300);
  await page.getByPlaceholder('Add a vibe…').fill('Dreamy');
  await page.getByPlaceholder('Add a vibe…').press('Enter');
  // The bulk command writes all 60 items with a sequentially awaited DB call each — give it
  // real time to finish before Shift+C.
  await page.waitForTimeout(2000);
  await canvas.click({ position: { x: 10, y: 10 } }); // move focus off the vibe input
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);

  // Shift+C turns Constellations on.
  await page.keyboard.press('Shift+C');
  await expect(page.getByText('Back to my layout')).toBeVisible({ timeout: 10000 });

  // Let the 800ms morph tween finish, then zoom to fit so the cluster is in frame.
  await page.waitForTimeout(2000);
  await page.keyboard.press('Shift+1');
  await page.waitForTimeout(700);
  await page.screenshot({ path: 'test-results/constellations.png' });

  // "Back to my layout" turns it off again.
  await page.getByText('Back to my layout').click();
  await expect(page.getByText('Back to my layout')).toBeHidden();
  await page.waitForTimeout(1000); // let the exit tween finish

  expect(errors, errors.join('\n')).toEqual([]);
});
