import type { Page } from '@playwright/test';

/** Opens the Library menu, makes a board with `name` (Patch 2 · C4: New board asks for a name),
 * and waits for it to open. */
export async function newBoard(page: Page, name = 'Untitled board'): Promise<void> {
  await page.getByRole('button', { name: 'Switch space' }).click();
  await page.getByRole('button', { name: 'New board', exact: true }).click();
  const field = page.getByLabel('New board');
  await field.fill(name);
  await field.press('Enter');
}
