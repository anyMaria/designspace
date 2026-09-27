import { test, expect } from '@playwright/test';

test('"Connect to…" creates a manual connection, shown and removable from the Details panel', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });

  await page.goto('/?seed=demo', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);

  const canvas = page.locator('canvas').first();
  await canvas.click();
  const box = await canvas.boundingBox();
  if (!box) throw new Error('canvas not found');
  const item0 = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  const item1 = { x: item0.x + 400, y: item0.y }; // one 400-world-unit grid cell over, at 100% zoom

  // Close the right panel first so it can't sit on top of item 1's screen position.
  await page.keyboard.press('l');
  await page.waitForTimeout(200);

  // Right-click item 0, choose "Connect to…".
  await page.mouse.click(item0.x, item0.y, { button: 'right' });
  await page.waitForTimeout(200);
  await page.getByRole('menuitem', { name: 'Connect to…' }).click();
  await expect(page.getByText('Click another item to connect')).toBeVisible();

  // Click item 1 to complete the connection.
  await page.mouse.click(item1.x, item1.y);
  await expect(page.getByText('Connected')).toBeVisible();

  // Reopen the panel, select item 0, and confirm "My connections" lists item 1.
  await page.keyboard.press('l');
  await page.mouse.click(item0.x, item0.y);
  await page.waitForTimeout(300);
  await expect(page.getByText('My connections')).toBeVisible();
  const connectionsField = page.getByText('My connections').locator('..');
  await expect(connectionsField.getByText('None yet')).not.toBeVisible();

  await page.screenshot({ path: 'test-results/connections-manual-list.png' });

  // Remove it via the Details panel's × button.
  await connectionsField.getByLabel('Remove connection').click();
  await page.waitForTimeout(200);
  await expect(connectionsField.getByText('None yet')).toBeVisible();

  expect(errors, errors.join('\n')).toEqual([]);
});
