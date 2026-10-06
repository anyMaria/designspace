import { test, expect, type Page } from '@playwright/test';

// Patch 3 · C2/C3: dragging a card near another snaps its top to the other's; Ctrl frees it;
// resizing snaps to a neighbour's width.
type R = { x: number; y: number; w: number; h: number };

async function selectedRect(page: Page): Promise<{ rect: R; origin: { x: number; y: number } }> {
  const holder = page.locator('[data-selected-rect]');
  await expect(holder).toHaveCount(1);
  const rect = JSON.parse((await holder.getAttribute('data-selected-rect')) ?? '{}') as R;
  const box = await holder.boundingBox();
  if (!box) throw new Error('no container box');
  return { rect, origin: { x: box.x, y: box.y } };
}

async function drag(
  page: Page,
  from: { x: number; y: number },
  to: { x: number; y: number },
  ctrl = false,
): Promise<void> {
  if (ctrl) await page.keyboard.down('Control');
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + (to.x - from.x) / 2, from.y + (to.y - from.y) / 2, { steps: 3 });
  await page.mouse.move(to.x, to.y, { steps: 3 });
  await page.mouse.up();
  if (ctrl) await page.keyboard.up('Control');
  await page.waitForTimeout(300);
}

async function twoCards(page: Page): Promise<{ a: R; b: R; origin: { x: number; y: number } }> {
  await page.setViewportSize({ width: 1800, height: 900 });
  await page.goto('/');
  await page.locator('canvas').first().waitFor();
  await page
    .locator('input[type=file]')
    .first()
    .setInputFiles(['tests/e2e/fixtures/wide-circle.png', 'tests/e2e/fixtures/red-square.png']);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(2500);
  // Select each by clicking the List tiles' cards on the canvas: find them via the camera's view.
  const box = await page.locator('canvas').first().boundingBox();
  if (!box) throw new Error('no canvas');
  // Marquee-select everything is not needed: click left half then right half of the batch.
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  await page.mouse.click(box.x + 100, box.y + 200); // empty space: deselect the import
  await page.mouse.click(cx - 120, cy);
  const first = await selectedRect(page);
  await page.mouse.click(cx + 120, cy);
  const second = await selectedRect(page);
  return { a: first.rect, b: second.rect, origin: second.origin };
}

test('dragging a card near another snaps its top; Ctrl moves it freely', async ({ page }) => {
  const { a, b, origin } = await twoCards(page);
  expect(a.x).not.toBe(b.x); // two different cards
  const left = a.x < b.x ? a : b;
  const right = a.x < b.x ? b : a;

  // Grab the right-hand card and drop it 4 px below the left card's top.
  const grab = { x: origin.x + right.x + right.w / 2, y: origin.y + right.y + right.h / 2 };
  const dy = left.y + 4 - right.y;
  await drag(page, grab, { x: grab.x, y: grab.y + dy });
  const snapped = await selectedRect(page);
  expect(Math.abs(snapped.rect.y - left.y)).toBeLessThan(0.6);

  // Now move it 5 px down again: from the snapped spot that is within reach of the same edge, but
  // with Ctrl held it stays where it was dropped.
  const grab2 = {
    x: origin.x + snapped.rect.x + snapped.rect.w / 2,
    y: origin.y + snapped.rect.y + snapped.rect.h / 2,
  };
  await drag(page, grab2, { x: grab2.x, y: grab2.y + 5 }, true);
  const free = await selectedRect(page);
  expect(free.rect.y - left.y).toBeGreaterThan(3.5);
});

test('resizing a card snaps its width to a neighbour', async ({ page }) => {
  const { a, b, origin } = await twoCards(page);
  const left = a.x < b.x ? a : b;
  const right = a.x < b.x ? b : a;
  // Resize the right card's east edge until its width is about 4 px off the left card's width.
  const target = left.w + 4;
  const edgeX = origin.x + right.x + right.w;
  const edgeY = origin.y + right.y + right.h / 2;
  await drag(page, { x: edgeX, y: edgeY }, { x: edgeX + (target - right.w), y: edgeY });
  const after = await selectedRect(page);
  expect(Math.abs(after.rect.w - left.w)).toBeLessThan(0.6);
});

test('the align bar lines cards up, and Ctrl+Z undoes it', async ({ page }) => {
  const { a, b, origin } = await twoCards(page);
  expect(a.y).not.toBe(b.y);
  // Select both with a marquee around them.
  await page.mouse.click(origin.x + 100, origin.y + 200);
  await page.mouse.move(origin.x + 480, origin.y + 250);
  await page.mouse.down();
  await page.mouse.move(origin.x + 1300, origin.y + 700, { steps: 6 });
  await page.mouse.up();

  const bar = page.getByTestId('align-bar');
  await expect(bar).toBeVisible();
  await bar.getByRole('button', { name: 'Align and distribute' }).click();
  await bar.getByRole('button', { name: 'Align top' }).click();
  await page.waitForTimeout(300);

  await page.mouse.click(origin.x + 100, origin.y + 200); // deselect
  await page.mouse.click(origin.x + (a.x < b.x ? a.x : b.x) + 40, origin.y + 400);
  const first = await selectedRect(page);
  await page.mouse.click(origin.x + 100, origin.y + 200);
  await page.mouse.click(origin.x + (a.x < b.x ? b.x : a.x) + 40, origin.y + 400);
  const second = await selectedRect(page);
  expect(Math.abs(first.rect.y - second.rect.y)).toBeLessThan(0.6);

  await page.keyboard.press('Control+z');
  await page.waitForTimeout(300);
  await page.mouse.click(origin.x + 100, origin.y + 200);
  await page.mouse.click(origin.x + (a.x < b.x ? a.x : b.x) + 40, origin.y + 400);
  const undone = await selectedRect(page);
  expect(Math.abs(undone.rect.y - second.rect.y)).toBeGreaterThan(1);
});
