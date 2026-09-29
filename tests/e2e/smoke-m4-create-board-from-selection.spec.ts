import { test, expect } from '@playwright/test';

test('"Create board from selection" (context menu) and "Create board from results" (search) both switch to a new board', async ({
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
  await canvas.click();
  const box = await canvas.boundingBox();
  if (!box) throw new Error('canvas not found');
  const item0 = { x: box.x + box.width / 2, y: box.y + box.height / 2 };

  const switcher = page.getByRole('button', { name: 'Switch space' });
  await expect(switcher).toContainText('Library');

  // Right-click an item, "Create board from selection".
  await page.mouse.click(item0.x, item0.y, { button: 'right' });
  await page.waitForTimeout(200);
  await page.getByRole('menuitem', { name: 'Create board from selection' }).click();
  await expect(switcher).toContainText('Untitled board');
  await expect(page.getByText('Created', { exact: false })).toBeVisible();

  // Back to Library, then try the search-results path.
  await switcher.click();
  await page.getByRole('menuitem', { name: 'Library' }).click();
  await expect(switcher).toContainText('Library');

  await page.keyboard.press('Control+k');
  const searchInput = page.getByPlaceholder('Search your library…');
  await expect(searchInput).toBeVisible();
  await page.getByRole('button', { name: 'Filters' }).click();
  await page.getByRole('button', { name: 'Image', exact: true }).click();
  await page.waitForTimeout(300);
  await expect(page.getByText('60 of 60', { exact: true })).toBeVisible();
  const createFromResults = page.getByRole('button', { name: 'Create board from results' });
  await expect(createFromResults).toBeEnabled();
  await createFromResults.click();
  await expect(switcher).toContainText('Untitled board');

  expect(errors, errors.join('\n')).toEqual([]);
});
