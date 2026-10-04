import { test, expect, type Page } from '@playwright/test';
import { near, waitForPixel } from './helpers/pixels';

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
  const first = await selectedRect(page);
  const origin = first.origin;
  let rect = first.rect;
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

// C3: widening a picture crops it; it is never stretched. wide-circle.png is 800×400 with a circle
// of radius 150 in the middle: in a 480×160 card drawn "cover" the circle is 90 px tall, so it
// reaches 70 px above and below the centre; stretched it would only reach 60.
test('widening a picture crops it instead of stretching it', async ({ page }) => {
  await importAndSelect(page);
  const { rect, origin } = await selectedRect(page);
  await drag(
    page,
    { x: origin.x + rect.x + rect.w, y: origin.y + rect.y + rect.h / 2 },
    { x: origin.x + rect.x + rect.w + 160, y: origin.y + rect.y + rect.h / 2 },
  );
  const after = (await selectedRect(page)).rect;
  expect(after.w).toBeCloseTo(rect.w + 160, 0);
  await page.mouse.move(5, 5);

  const cx = origin.x + after.x + after.w / 2;
  const cy = origin.y + after.y + after.h / 2;
  const circle: [number, number, number] = [240, 180, 60];
  await waitForPixel(page, cx, cy, (c) => near(c, circle, 40), 15_000);
  await waitForPixel(page, cx, cy + 70, (c) => near(c, circle, 40), 15_000);
  // 30 px inside the right edge it is background, not circle.
  await waitForPixel(
    page,
    origin.x + after.x + after.w - 30,
    cy,
    (c) => !near(c, circle, 60),
    15_000,
  );
});

test('a cropped picture offers Adjust crop and Reset crop; reset restores its proportions', async ({
  page,
}) => {
  await importAndSelect(page);
  const { rect, origin } = await selectedRect(page);
  await drag(
    page,
    { x: origin.x + rect.x + rect.w, y: origin.y + rect.y + rect.h / 2 },
    { x: origin.x + rect.x + rect.w + 160, y: origin.y + rect.y + rect.h / 2 },
  );
  const cropped = (await selectedRect(page)).rect;
  await page.mouse.click(
    origin.x + cropped.x + cropped.w / 2,
    origin.y + cropped.y + cropped.h / 2,
    { button: 'right' },
  );
  await expect(page.getByRole('menuitem', { name: 'Adjust crop' })).toBeVisible();

  // Adjust crop: the hint shows; Esc finishes.
  await page.getByRole('menuitem', { name: 'Adjust crop' }).click();
  await expect(page.getByTestId('crop-hint')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('crop-hint')).toBeHidden();

  // Reset crop: back to the picture's own proportions (2:1) at the same area.
  await page.mouse.click(
    origin.x + cropped.x + cropped.w / 2,
    origin.y + cropped.y + cropped.h / 2,
    { button: 'right' },
  );
  await page.getByRole('menuitem', { name: 'Reset crop' }).click();
  await page.waitForTimeout(300);
  const reset = (await selectedRect(page)).rect;
  expect(reset.w / reset.h).toBeCloseTo(2, 1);
});
