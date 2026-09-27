import { test, expect } from '@playwright/test';

test('the drag handle connects two items, and double-click/Delete on the line labels/removes it', async ({
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
  // Canvas center happens to land on item 0's own top-left corner (empirically confirmed via a
  // debug screenshot — the seeded demo grid places item 0's card there, not centered under it).
  // At 100% zoom (1 world unit = 1 screen px), item 0's card is a 320×400 rect from that corner,
  // and item 1 (the next grid column, 400 world units over) is the same rect shifted +400 in x.
  const topLeft = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  const item0Center = { x: topLeft.x + 160, y: topLeft.y + 200 };
  const item1Center = { x: topLeft.x + 560, y: topLeft.y + 200 };
  // The connect handle sits at the hovered item's right edge, vertically centered.
  const handle = { x: topLeft.x + 320, y: topLeft.y + 200 };

  await page.keyboard.press('l'); // close the panel so item 1 isn't covered
  await page.waitForTimeout(200);

  // Hover item 0 to reveal the handle, then drag it onto item 1.
  await page.mouse.move(item0Center.x, item0Center.y);
  await page.waitForTimeout(200);
  await page.mouse.move(handle.x, handle.y);
  await page.mouse.down();
  await page.mouse.move(item1Center.x, item1Center.y, { steps: 10 });
  await page.mouse.up();
  await expect(page.getByText('Connected')).toBeVisible();

  // Hover mode (the default) draws a direct line between two items sharing a criterion — here
  // just `manual`, so it runs straight from item 0's center to item 1's center with no parallel
  // offset (offset only kicks in with 2+ shared criteria). Double-click its midpoint to label it.
  // (Show all's hub model needs 2+ items sharing the *same* connection target to form a hub, so
  // a single one-to-one manual connection like this one never renders there — see DECISIONS.md.)
  await page.mouse.move(item0Center.x, item0Center.y);
  await page.waitForTimeout(500); // past the 300ms hover delay
  const mid = { x: (item0Center.x + item1Center.x) / 2, y: item0Center.y };
  await page.screenshot({ path: 'test-results/connections-manual-hover-line.png' });
  await page.mouse.dblclick(mid.x, mid.y);
  await page.waitForTimeout(300);

  const dialog = page.getByRole('dialog', { name: 'Label this connection' });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel('Label this connection').fill('same typography');
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(dialog).toBeHidden();

  // Reopen the panel and confirm the Details panel shows the label.
  await page.keyboard.press('l');
  await page.mouse.click(item0Center.x, item0Center.y);
  await page.waitForTimeout(300);
  const connectionsField = page.getByText('My connections').locator('..');
  await expect(connectionsField.getByText('same typography', { exact: false })).toBeVisible();

  // "Select the line and press Delete" — close the panel again so the line is clickable, click
  // it once (select, not double), then Delete.
  await page.keyboard.press('l');
  await page.waitForTimeout(200);
  await page.mouse.move(item0Center.x, item0Center.y);
  await page.waitForTimeout(500);
  await page.mouse.click(mid.x, mid.y);
  await page.waitForTimeout(200);
  await page.keyboard.press('Delete');
  await page.waitForTimeout(300);

  await page.keyboard.press('l');
  await page.mouse.click(item0Center.x, item0Center.y);
  await page.waitForTimeout(300);
  await expect(connectionsField.getByText('None yet')).toBeVisible();

  expect(errors, errors.join('\n')).toEqual([]);
});
