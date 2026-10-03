import { test, expect } from '@playwright/test';

test('double-clicking empty canvas creates a note, typing saves it, and it is searchable', async ({
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
  const box = await canvas.boundingBox();
  if (!box) throw new Error('canvas not found');
  // Far from any seeded item, so the double-click lands on empty canvas.
  const emptySpot = { x: box.x + 220, y: box.y + 200 }; // the note is 280 wide: keep it on screen

  await page.mouse.dblclick(emptySpot.x, emptySpot.y);

  // The note editor opens — a ProseMirror contentEditable region, focused and ready to type.
  const editor = page.locator('.ProseMirror');
  await expect(editor).toBeVisible();
  await editor.click();
  await page.keyboard.type('Mood: warm autumn light');

  // Click elsewhere on the canvas to close (and save) the editor.
  await page.mouse.click(box.x + box.width - 80, box.y + box.height - 80);
  await expect(editor).toBeHidden();

  // Searching for the note's text finds it (§2.11 "searchable").
  await page.keyboard.press('Control+k');
  const searchInput = page.getByPlaceholder('Search your library…');
  await expect(searchInput).toBeVisible();
  await searchInput.fill('warm autumn');
  await page.waitForTimeout(300);
  await expect(page.getByText(/^1 of \d+$/)).toBeVisible();

  expect(errors, errors.join('\n')).toEqual([]);
});
