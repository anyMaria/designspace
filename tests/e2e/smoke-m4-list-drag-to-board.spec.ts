import { test, expect } from '@playwright/test';

test("the List panel's [This board | Library] switch scopes tiles, and dragging a Library tile onto an empty board adds it", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });

  await page.goto('/?seed=demo', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);

  // The Library map itself never shows the toggle — there's no distinction to make there.
  await expect(page.getByRole('tab', { name: 'This board' })).toHaveCount(0);

  // "+ New board" creates and switches to an empty board.
  await page.getByRole('button', { name: 'Switch space' }).click();
  await page.getByRole('menuitem', { name: '+ New board' }).click();
  await page.waitForTimeout(300);

  // "This board" is the default and is empty — but the toggle itself must still be visible (the
  // owner's only way to reach "Library" and drag something onto this brand-new board).
  const thisBoardTab = page.getByRole('tab', { name: 'This board' });
  await expect(thisBoardTab).toBeVisible();
  await expect(thisBoardTab).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByText('Nothing here yet.')).toBeVisible();

  // Switch to "Library": the full catalog appears, and its tiles are draggable.
  await page.getByRole('tab', { name: 'Library' }).click();
  await page.waitForTimeout(200);
  const libraryTile = page.locator('button.ds-list-tile').first();
  await expect(libraryTile).toBeVisible();
  await expect(libraryTile).toHaveAttribute('draggable', 'true');

  // Drag it onto the canvas. HTML5 drag-and-drop is a separate event family Playwright's mouse
  // API doesn't drive (unlike smoke-m1-drop.spec.ts's native OS file drop, which Playwright
  // supports directly) — dispatch the same DataTransfer through dragstart/dragover/drop from
  // page context instead, so the custom MIME set in dragstart survives to the drop handler (two
  // separately constructed DataTransfer objects, one per `locator.dispatchEvent` call, would not
  // carry it across).
  const canvas = page.locator('canvas').first();
  const box = await canvas.boundingBox();
  if (!box) throw new Error('canvas not found');
  const dropPoint = { x: box.x + box.width / 2, y: box.y + box.height / 2 };

  await page.evaluate(({ x, y }) => {
    const tile = document.querySelector('button.ds-list-tile');
    if (!tile) throw new Error('no list tile found');
    const dt = new DataTransfer();
    tile.dispatchEvent(new DragEvent('dragstart', { dataTransfer: dt, bubbles: true }));
    const canvasEl = document.querySelector('canvas');
    if (!canvasEl) throw new Error('no canvas found');
    canvasEl.dispatchEvent(
      new DragEvent('dragover', { dataTransfer: dt, bubbles: true, clientX: x, clientY: y }),
    );
    canvasEl.dispatchEvent(
      new DragEvent('drop', { dataTransfer: dt, bubbles: true, clientX: x, clientY: y }),
    );
  }, dropPoint);
  await page.waitForTimeout(300);

  // Back on "This board", the dropped item now shows up (the board is no longer empty).
  await page.getByRole('tab', { name: 'This board' }).click();
  await page.waitForTimeout(200);
  await expect(page.getByText('Nothing here yet.')).toBeHidden();
  await expect(page.locator('button.ds-list-tile')).toHaveCount(1);

  expect(errors, errors.join('\n')).toEqual([]);
});
