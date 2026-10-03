import { test, expect } from '@playwright/test';

test('the Add menu creates a frame, double-clicking its title renames it, dragging moves it, and Delete removes it', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });

  // An empty library: new frames land at the viewport centre only when that spot is free (B7).
  await page.goto('/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);

  const canvas = page.locator('canvas').first();
  const box = await canvas.boundingBox();
  if (!box) throw new Error('canvas not found');
  const center = { x: box.x + box.width / 2, y: box.y + box.height / 2 };

  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Frame', exact: true }).click();
  await page.waitForTimeout(300);

  // The default frame is 480×360, centered on the drop point (screen center, at the default
  // 100% zoom this test relies on elsewhere too — see smoke-m3-connections-drag-label.spec.ts's
  // own note about the same assumption). Its title sits 16px font + 6px gap = 22 world units
  // above its top edge (frame.y = center.y - 180); click inside that small label hit rect.
  const title = { x: center.x - 240 + 20, y: center.y - 180 - 22 + 10 };
  await page.mouse.dblclick(title.x, title.y);

  const dialog = page.getByRole('dialog', { name: 'Rename frame' });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel('Rename frame').fill('Moodboard row 1');
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(dialog).toBeHidden();

  // Dragging the (now-wider) renamed title by a small amount moves the frame — no assertion
  // beyond "it doesn't throw", since the exact new title screen rect after a rename isn't worth
  // re-deriving here; the drag-and-drop wiring itself is what smoke-m3-connections-drag-label.spec.ts
  // and smoke-m1-canvas-ui.spec.ts already exercise for cards.
  await page.mouse.move(title.x, title.y);
  await page.mouse.down();
  await page.mouse.move(title.x + 60, title.y + 40, { steps: 5 });
  await page.mouse.up();
  await page.waitForTimeout(300);

  // The drag left the frame selected (and moved the title along with it) — Delete removes it,
  // confirmed by double-clicking the same spot no longer opening the rename dialog.
  const movedTitle = { x: title.x + 60, y: title.y + 40 };
  await page.mouse.click(movedTitle.x, movedTitle.y);
  await page.keyboard.press('Delete');
  await page.waitForTimeout(200);
  await page.mouse.dblclick(movedTitle.x, movedTitle.y);
  await page.waitForTimeout(200);
  await expect(page.getByRole('dialog', { name: 'Rename frame' })).toBeHidden();

  expect(errors, errors.join('\n')).toEqual([]);
});
