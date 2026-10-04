import { test, expect } from '@playwright/test';

test('Show all mode draws hub stars and item-to-hub lines for a shared classification', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });

  await page.goto('/?seed=demo', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);

  // Give every seeded item the same Vibe, so Show all has a real hub (60 items) to draw rather
  // than an empty graph.
  const canvas = page.locator('canvas').first();
  await canvas.click();
  await page.keyboard.press('Control+a');
  await page.waitForTimeout(300);
  await page.getByPlaceholder('Add a vibe…').fill('Dreamy');
  await page.getByPlaceholder('Add a vibe…').press('Enter');
  await page.waitForTimeout(300);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  await canvas.click({ position: { x: 10, y: 10 } }); // move focus off the vibe input
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);

  // Open the popover, switch to Show all.
  await page.keyboard.press('c');
  await page.getByRole('tab', { name: 'Show all' }).click();
  await page.waitForTimeout(500);

  // No "too many links" message for 60 items well under the 5,000-line cap.
  await expect(page.getByText('Too many links. Filter first.')).toBeHidden();

  await page.screenshot({ path: 'test-results/connections-showall.png' });

  // Zoom to fit so the hub (roughly centered on the item cluster) is under the cursor, then
  // hover it — the star's pointerover should fire `setHoverHighlight` without throwing.
  await page.keyboard.press('Shift+1');
  await page.waitForTimeout(500);
  const box = await canvas.boundingBox();
  if (!box) throw new Error('canvas not found');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForTimeout(300);

  await page.keyboard.press('Escape'); // close the popover
  await page.waitForTimeout(200);
  await page.screenshot({ path: 'test-results/connections-showall-hub.png' });

  expect(errors, errors.join('\n')).toEqual([]);
});
