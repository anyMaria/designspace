import { test, expect } from '@playwright/test';
import { newBoard } from './helpers/boards';

test('dropping a file while a board is open adds it there and also onto the Library map', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });

  await page.goto('/?seed=demo', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);

  // Baseline: how many items the seeded Library map already has.
  await page.keyboard.press('Control+a');
  await expect(page.getByText(/^\d+ items$/)).toBeVisible();
  const libraryBefore = Number((await page.getByText(/^\d+ items$/).textContent())?.split(' ')[0]);

  // Create and switch to a new, empty board.
  await newBoard(page);
  await page.waitForTimeout(300);

  const buffer = await page.evaluate(() => {
    const b64 =
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    const binary = atob(b64);
    return Array.from(binary, (c) => c.charCodeAt(0));
  });

  // Drop one file onto the board's canvas.
  await page.evaluate((bytes) => {
    const file = new File([new Uint8Array(bytes)], 'dropped-on-board.png', { type: 'image/png' });
    const dt = new DataTransfer();
    dt.items.add(file);
    document.body.dispatchEvent(
      new DragEvent('drop', {
        dataTransfer: dt,
        bubbles: true,
        cancelable: true,
        clientX: 400,
        clientY: 300,
      }),
    );
  }, buffer);
  await page.waitForTimeout(1000);

  // The board itself now has exactly the one dropped item. (A single selected item switches the
  // panel to Details rather than showing an "N items" count — that only appears for 2+, per
  // Shell.tsx — so check the List panel's own tile count instead.)
  await page.getByRole('tab', { name: 'List' }).click();
  await page.waitForTimeout(200);
  await expect(page.locator('button.ds-list-tile')).toHaveCount(1);

  // Back on the Library map, the count grew by one too — the item landed there as well.
  const switcher = page.getByRole('button', { name: 'Switch space' });
  await switcher.click();
  await page.getByRole('menuitem', { name: 'Library' }).click();
  await page.waitForTimeout(300);
  await page.keyboard.press('Control+a');
  await expect(page.getByText(`${libraryBefore + 1} items`, { exact: true })).toBeVisible();

  expect(errors, errors.join('\n')).toEqual([]);
});
