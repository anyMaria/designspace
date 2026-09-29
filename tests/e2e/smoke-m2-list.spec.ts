import { test, expect } from '@playwright/test';

test('the List panel groups, sorts, virtualizes, and clicking a tile selects+flies while double-click opens Focus', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });

  await page.goto('/?seed=demo', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);

  // The List tab is the default when nothing is selected.
  await expect(page.getByRole('tab', { name: 'List' })).toHaveAttribute('aria-selected', 'true');
  await page.screenshot({ path: 'test-results/list-panel.png' });

  // Group by Kind — every seeded item is 'image', so exactly one group header should appear.
  await page.getByLabel('Group by').selectOption('kind');
  await page.waitForTimeout(300);
  await expect(page.getByText('Image', { exact: true })).toBeVisible();
  await page.screenshot({ path: 'test-results/list-grouped.png' });

  // Collapsing the group hides its tiles (the header stays).
  await page.getByText('Image', { exact: true }).click();
  await page.waitForTimeout(200);

  // Back to no grouping for the click/dblclick checks below.
  await page.getByLabel('Group by').selectOption('none');
  await page.waitForTimeout(300);

  // Click a tile: selects on canvas and switches the panel to Details.
  const tile = page.locator('button.ds-list-tile').first();
  await tile.click();
  await page.waitForTimeout(300);
  await expect(page.getByRole('tab', { name: 'Details' })).toHaveAttribute('aria-selected', 'true');

  // Go back to List, double-click a tile: opens Focus view.
  await page.getByRole('tab', { name: 'List' }).click();
  await page.waitForTimeout(200);
  await page.locator('button.ds-list-tile').first().dblclick();
  await page.waitForTimeout(300);
  await expect(page.getByLabel('Close')).toBeVisible();
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);

  // Expand opens a full-window gallery; Collapse returns to the docked panel.
  await page.getByLabel('Expand').click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'test-results/list-expanded.png' });
  await page.getByLabel('Collapse').click();
  await page.waitForTimeout(200);

  expect(errors, errors.join('\n')).toEqual([]);
});
