import { test, expect } from '@playwright/test';

test('bulk Details panel edits several items at once, and Back to Inbox reverses the Inbox rule', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });

  await page.goto('/?seed=demo', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);

  const inboxChip = page.getByText(/^Inbox \d+$/);
  const initialText = await inboxChip.textContent();
  const initialCount = Number(initialText?.match(/\d+/)?.[0]);
  expect(initialCount).toBeGreaterThan(0);

  const canvas = page.locator('canvas').first();
  const box = await canvas.boundingBox();
  if (!box) throw new Error('canvas not found');
  await canvas.click();
  await page.keyboard.press('Control+a');
  await page.waitForTimeout(300);

  await expect(page.getByRole('tab', { name: 'Details' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByText(`${initialCount} items`, { exact: true })).toBeVisible();
  await page.screenshot({ path: 'test-results/bulk-details-panel.png' });

  // Bulk Type: applies to every selected item and marks each sorted — the whole Inbox clears.
  await page.getByRole('button', { name: 'Poster' }).first().click();
  await page.waitForTimeout(400);
  await expect(inboxChip).toHaveCount(0);

  // Back to Inbox (context menu, still selected) reverses it for every item.
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2, { button: 'right' });
  await page.waitForTimeout(200);
  await page.getByRole('menuitem', { name: 'Back to Inbox' }).click();
  await page.waitForTimeout(400);
  await expect(page.getByText(`Inbox ${initialCount}`, { exact: true })).toBeVisible();

  expect(errors, errors.join('\n')).toEqual([]);
});
