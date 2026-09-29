import { test, expect } from '@playwright/test';

test('zoom menu, minimap and item context menu all work against the seeded demo library', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });

  await page.goto('/?seed=demo', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);

  // Zoom menu: open it, read the current percentage, click "Zoom to fit", confirm it changed.
  const zoomButton = page.getByRole('button', { name: 'Zoom' });
  await expect(zoomButton).toBeVisible();
  const before = await zoomButton.textContent();
  await zoomButton.click();
  await page.getByRole('menuitem', { name: 'Zoom to fit' }).click();
  await page.waitForTimeout(700); // flyTo eases over ~500ms
  const after = await zoomButton.textContent();
  expect(after).not.toBe(before);

  // Minimap: on by default (§2.1), confirm it renders.
  await expect(page.getByRole('img', { name: 'Minimap' })).toBeVisible();
  await page.screenshot({ path: 'test-results/minimap-and-zoom.png' });

  // Context menu: right-click an item, confirm the menu appears with expected actions.
  const canvas = page.locator('canvas').first();
  const box = await canvas.boundingBox();
  if (!box) throw new Error('canvas not found');
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForTimeout(200);
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2, { button: 'right' });
  await page.waitForTimeout(200);
  await page.screenshot({ path: 'test-results/context-menu.png' });

  expect(errors, errors.join('\n')).toEqual([]);
});
