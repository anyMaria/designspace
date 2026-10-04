import { test, expect, type Page } from '@playwright/test';

// Patch 2 · C2: resize a picture from its sides and corners. The engine publishes the selected
// card's on-screen rect (container px) in `data-selected-rect`, so nothing here is hard-coded.
type R = { x: number; y: number; w: number; h: number };

async function selectedRect(page: Page): Promise<{ rect: R; origin: { x: number; y: number } }> {
  const holder = page.locator('[data-selected-rect]');
  await expect(holder).toHaveCount(1);
  const rect = JSON.parse((await holder.getAttribute('data-selected-rect')) ?? '{}') as R;
  const box = await holder.boundingBox();
  if (!box) throw new Error('no container box');
  return { rect, origin: { x: box.x, y: box.y } };
}

async function importAndSelect(page: Page): Promise<void> {
  // Wide enough that the Details panel (which opens on selection) stays clear of the card.
  await page.setViewportSize({ width: 1800, height: 900 });
  await page.goto('/');
  await page.locator('canvas').first().waitFor();
  await page
    .locator('input[type=file]')
    .first()
    .setInputFiles('tests/e2e/fixtures/wide-circle.png');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(1500);
  const box = await page.locator('canvas').first().boundingBox();
  if (!box) throw new Error('no canvas');
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
}

async function drag(
  page: Page,
  from: { x: number; y: number },
  to: { x: number; y: number },
  key?: 'Shift' | 'Alt',
): Promise<void> {
  if (key) await page.keyboard.down(key);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move((from.x + to.x) / 2, (from.y + to.y) / 2, { steps: 4 });
  await page.mouse.move(to.x, to.y, { steps: 4 });
  await page.mouse.up();
  if (key) await page.keyboard.up(key);
  await page.waitForTimeout(300);
}

test('a side handle changes one dimension; corners keep proportions; Shift frees them; Alt resizes from the centre', async ({
  page,
}) => {
  await importAndSelect(page);

  // Right side: wider, same height.
  let { rect, origin } = await selectedRect(page);
  await drag(
    page,
    { x: origin.x + rect.x + rect.w, y: origin.y + rect.y + rect.h / 2 },
    { x: origin.x + rect.x + rect.w + 100, y: origin.y + rect.y + rect.h / 2 },
  );
  const afterSide = (await selectedRect(page)).rect;
  expect(afterSide.w).toBeCloseTo(rect.w + 100, 0);
  expect(afterSide.h).toBeCloseTo(rect.h, 0);

  // Bottom-right corner: proportions kept.
  rect = afterSide;
  await drag(
    page,
    { x: origin.x + rect.x + rect.w, y: origin.y + rect.y + rect.h },
    { x: origin.x + rect.x + rect.w + 60, y: origin.y + rect.y + rect.h + 5 },
  );
  const afterCorner = (await selectedRect(page)).rect;
  expect(afterCorner.w / afterCorner.h).toBeCloseTo(rect.w / rect.h, 1);

  // Shift on a corner: proportions change.
  rect = afterCorner;
  await drag(
    page,
    { x: origin.x + rect.x + rect.w, y: origin.y + rect.y + rect.h },
    { x: origin.x + rect.x + rect.w + 80, y: origin.y + rect.y + rect.h + 10 },
    'Shift',
  );
  const afterShift = (await selectedRect(page)).rect;
  expect(Math.abs(afterShift.w / afterShift.h - rect.w / rect.h)).toBeGreaterThan(0.1);

  // Alt on the right side: both left and right edges move.
  rect = afterShift;
  await drag(
    page,
    { x: origin.x + rect.x + rect.w, y: origin.y + rect.y + rect.h / 2 },
    { x: origin.x + rect.x + rect.w + 40, y: origin.y + rect.y + rect.h / 2 },
    'Alt',
  );
  const afterAlt = (await selectedRect(page)).rect;
  expect(afterAlt.x).toBeLessThan(rect.x - 30);
  expect(afterAlt.x + afterAlt.w).toBeGreaterThan(rect.x + rect.w + 30);
});
