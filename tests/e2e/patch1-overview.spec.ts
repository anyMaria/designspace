import { test, expect } from '@playwright/test';
import { pixelAt } from './helpers/pixels';

// Patch 1 · G2 (+ Patch 2 · B2): O opens the Overview, nodes are drawn, Esc closes it.
test('the Overview opens with O, draws the library, and closes with Esc', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/?seed=demo', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);

  await page.keyboard.press('o');
  const overview = page.getByTestId('overview');
  await expect(overview).toBeVisible();
  await page.waitForTimeout(1500);

  // Nodes are drawn: somewhere in the middle band the pixels are not the plain background.
  const bg = [0x17, 0x0b, 0x1c];
  let drawn = false;
  for (let x = 300; x < 1000 && !drawn; x += 24) {
    for (let y = 250; y < 600 && !drawn; y += 24) {
      const c = await pixelAt(page, x, y);
      if (c.some((v, i) => Math.abs(v - bg[i]) > 12)) drawn = true;
    }
  }
  expect(drawn).toBe(true);

  // It opens on Clusters (Patch 2 · B2); the Spacing slider keeps it open and redraws.
  await expect(page.getByRole('tab', { name: 'Clusters' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  const spacing = page.getByRole('slider', { name: 'Spacing' });
  await spacing.focus();
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(800);
  await expect(overview).toBeVisible();

  await page.getByRole('tab', { name: 'My layout' }).click();
  await page.waitForTimeout(500);
  await page.keyboard.press('Escape');
  await expect(overview).toBeHidden();

  // The minimap's expand button opens it too.
  await page.getByRole('button', { name: 'Open the Overview (O)' }).click();
  await expect(overview).toBeVisible();
});

// Patch 3 · D1–D3: the Clusters layout is a live graph. Spacing moves the groups at once, a dot
// can be dragged, and the real map is not touched.
test('the Clusters graph is live: Spacing loosens it, dragging a dot holds it under the pointer', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/?seed=demo', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);
  await page.keyboard.press('o');
  const canvas = page.getByTestId('overview-canvas');
  await expect(canvas).toBeVisible();
  await expect(page.getByText("The map couldn't be arranged.")).toBeHidden();

  type Sample = { id: string; x: number; y: number };
  const sample = async (): Promise<Sample> => {
    const raw = await canvas.getAttribute('data-sample');
    if (!raw) throw new Error('nothing drawn yet');
    return JSON.parse(raw) as Sample;
  };
  // Wait for the graph to come to rest (the sample stops moving).
  const settled = async (): Promise<Sample> => {
    let last = await sample();
    for (let i = 0; i < 40; i++) {
      await page.waitForTimeout(400);
      const now = await sample();
      if (Math.hypot(now.x - last.x, now.y - last.y) < 0.2) return now;
      last = now;
    }
    return last;
  };
  await expect
    .poll(async () => canvas.getAttribute('data-sample'), { timeout: 20_000 })
    .not.toBeNull();
  const before = await settled();

  // Spacing changes the forces at once: the same dot ends up somewhere else.
  const slider = page.getByRole('slider', { name: 'Spacing' });
  await slider.focus();
  for (let i = 0; i < 6; i++) await page.keyboard.press('ArrowRight');
  const after = await settled();
  expect(Math.hypot(after.x - before.x, after.y - before.y)).toBeGreaterThan(2);

  // Drag the dot: while held it sits under the pointer.
  const box = await canvas.boundingBox();
  if (!box) throw new Error('no canvas box');
  const start = { x: box.x + after.x, y: box.y + after.y };
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x + 60, start.y + 40, { steps: 6 });
  await page.mouse.move(start.x + 120, start.y + 80, { steps: 6 });
  await page.waitForTimeout(150);
  const heldRaw = await canvas.getAttribute('data-held');
  if (!heldRaw) throw new Error('nothing is being held');
  const held = JSON.parse(heldRaw) as Sample;
  expect(
    Math.hypot(held.x - (start.x - box.x + 120), held.y - (start.y - box.y + 80)),
  ).toBeLessThan(4);
  await page.mouse.up();
  await page.waitForTimeout(300);
  await expect(canvas).not.toHaveAttribute('data-held', /.+/);
  await expect(page.getByTestId('overview')).toBeVisible();
});
