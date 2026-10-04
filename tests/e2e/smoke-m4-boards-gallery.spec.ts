import { test, expect } from '@playwright/test';
import { newBoard } from './helpers/boards';

test('the space switcher creates a board, and the gallery renames/duplicates/deletes/restores it', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });

  await page.goto('/?seed=demo', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);

  // Switcher starts on "Library".
  const switcher = page.getByRole('button', { name: 'Switch space' });
  await expect(switcher).toContainText('Library');

  // "+ New board" from the switcher creates a board and switches to it.
  await switcher.click();
  // The current space has a check (Patch 2 · C4).
  await expect(
    page.getByRole('menuitem', { name: /^Library/ }).getByLabel('current'),
  ).toBeVisible();
  await page.getByRole('button', { name: 'New board', exact: true }).click();
  const newBoardField = page.getByLabel('New board');
  await newBoardField.fill('Untitled board');
  await newBoardField.press('Enter');
  await expect(switcher).toContainText('Untitled board');

  // Back to Library, then open the full gallery.
  await switcher.click();
  await page.getByRole('menuitem', { name: 'Library' }).click();
  await expect(switcher).toContainText('Library');
  await switcher.click();
  await page.getByRole('menuitem', { name: 'All boards…' }).click();

  const gallery = page.getByRole('heading', { name: 'Boards' });
  await expect(gallery).toBeVisible();
  const card = page.locator('.ds-panel', { hasText: 'Untitled board' }).first();
  await expect(card).toBeVisible();

  // Rename it — the card's own "Untitled board" text is replaced by the input while renaming,
  // so the input itself (an <input>'s value isn't part of an element's accessible/inner text)
  // is found page-wide rather than re-querying the (no-longer-matching) `card` locator.
  await card.getByRole('button', { name: 'Rename' }).click();
  const nameField = page.getByLabel('Board name');
  await nameField.fill('Mood: Autumn');
  await nameField.press('Enter');
  await expect(page.locator('.ds-panel', { hasText: 'Mood: Autumn' })).toBeVisible();

  // Duplicate it.
  const renamed = page.locator('.ds-panel', { hasText: 'Mood: Autumn' }).first();
  await renamed.getByRole('button', { name: 'Duplicate' }).click();
  await expect(page.locator('.ds-panel', { hasText: 'Mood: Autumn copy' })).toBeVisible();

  // Delete the copy — it leaves the gallery (it is in the Trash now). Restore it from the Trash
  // screen (Library menu → Trash), then it is back in the gallery's grid.
  const copyCard = page.locator('.ds-panel', { hasText: 'Mood: Autumn copy' }).first();
  await copyCard.getByRole('button', { name: 'Delete' }).click();
  await expect(page.locator('.ds-panel', { hasText: 'Mood: Autumn copy' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Close' }).click();
  await switcher.click();
  await page.getByRole('menuitem', { name: /^Trash/ }).click();
  const trash = page.getByRole('dialog', { name: 'Trash' });
  await expect(trash.getByText('Mood: Autumn copy')).toBeVisible();
  await trash.getByRole('button', { name: 'Restore' }).click();
  await page.keyboard.press('Escape');
  await expect(trash).toBeHidden();
  await switcher.click();
  await page.getByRole('menuitem', { name: 'All boards…' }).click();
  await expect(
    page.locator('.ds-panel', { hasText: 'Mood: Autumn copy' }).getByRole('button', {
      name: 'Delete',
    }),
  ).toBeVisible();

  // Close the gallery.
  await page.getByRole('button', { name: 'Close' }).click();
  await expect(gallery).toBeHidden();

  expect(errors, errors.join('\n')).toEqual([]);
});
test('the Library menu asks for a name, and a click on the dock closes it (Patch 2 · C4)', async ({
  page,
}) => {
  await page.goto('/?seed=demo', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);

  const switcher = page.getByRole('button', { name: 'Switch space' });
  await newBoard(page, 'Moodboard');
  await expect(switcher).toContainText('Moodboard');

  // Reopen: the new board is listed and checked; the Trash entry is there.
  await switcher.click();
  const menu = page.getByRole('menu', { name: 'Switch space' });
  await expect(
    menu.getByRole('menuitem', { name: /^Moodboard/ }).getByLabel('current'),
  ).toBeVisible();
  await expect(menu.getByRole('menuitem', { name: /^Trash/ })).toBeVisible();

  // Clicking the dock (outside the menu) closes it.
  await page.getByRole('button', { name: 'Zoom' }).click({ force: true });
  await expect(menu).toBeHidden();
});
