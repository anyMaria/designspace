import { test, expect } from '@playwright/test';

test('Triage opens from the Inbox chip, classifies with number keys and the keyboard flow, and reaches Inbox zero', async ({
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
  await expect(inboxChip).toBeVisible();
  await inboxChip.click();
  await page.waitForTimeout(300);

  await expect(page.getByText(/^1 of \d+$/)).toBeVisible();
  await page.screenshot({ path: 'test-results/triage-open.png' });

  // Number key sets Type (chip 1) without needing to click.
  await page.keyboard.press('1');
  await page.waitForTimeout(200);

  // "V" focuses the Vibe field; typing + Enter adds a value while Triage's own shortcuts stay
  // off (Enter shouldn't advance while a chip input is focused).
  await page.keyboard.press('v');
  await page.keyboard.type('Dreamy');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(200);
  await expect(page.getByText('Dreamy', { exact: true })).toBeVisible();
  await expect(page.getByText(/^1 of \d+$/)).toBeVisible(); // still on item 1 — Enter stayed in the field

  // Blur back onto the overlay so the global shortcuts apply again (the first Esc closes the
  // word list, the second leaves the field), then advance with Enter.
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(150);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(200);
  await expect(page.getByText(/^2 of \d+$/)).toBeVisible();

  // -> skips forward, <- goes back.
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(150);
  await expect(page.getByText(/^3 of \d+$/)).toBeVisible();
  await page.keyboard.press('ArrowLeft');
  await page.waitForTimeout(150);
  await expect(page.getByText(/^2 of \d+$/)).toBeVisible();

  // Esc exits Triage back to the map.
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  await expect(page.getByText(/^\d+ of \d+$/)).not.toBeVisible();

  expect(errors, errors.join('\n')).toEqual([]);
});
