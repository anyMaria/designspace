import { test, expect } from '@playwright/test';

test("the suggestions tray shows unadded matches for the board's source filter, and × dismisses one", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });

  await page.goto('/?seed=demo', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);

  // A text filter that matches a small, known subset of the seeded demo items (every 12th of 60
  // is titled "BAUHAUS N" — 5 matches) — narrow enough to work with individually below.
  await page.keyboard.press('Control+k');
  const searchInput = page.getByPlaceholder('Search your library…');
  await searchInput.fill('BAUHAUS');
  await page.waitForTimeout(300);
  await expect(page.getByText('5 of 60', { exact: true })).toBeVisible();

  // "Create board from results" places all 5 matches on a new board and saves the filter as its
  // sourceFilter.
  await page.getByRole('button', { name: 'Create board from results' }).click();
  const switcher = page.getByRole('button', { name: 'Switch space' });
  await expect(switcher).toContainText('Untitled board');
  await page.waitForTimeout(300);

  // No suggestions yet — every match is already on the board.
  await expect(page.getByText('More like this')).toBeHidden();

  // Remove one placed item from the board (not Trash) — it still matches "BAUHAUS", so it should
  // now show up as a suggestion.
  const canvas = page.locator('canvas').first();
  const box = await canvas.boundingBox();
  if (!box) throw new Error('canvas not found');
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2, { button: 'right' });
  await page.waitForTimeout(200);
  await page.getByRole('menuitem', { name: 'Remove from board' }).click();
  await page.waitForTimeout(300);

  const tray = page.getByText('More like this');
  await expect(tray).toBeVisible();
  await expect(page.getByText('1', { exact: true })).toBeVisible();

  // Dismissing the one suggestion hides the tray again (nothing left to suggest).
  await page.getByRole('button', { name: 'Dismiss suggestion' }).click();
  await page.waitForTimeout(300);
  await expect(tray).toBeHidden();

  expect(errors, errors.join('\n')).toEqual([]);
});
