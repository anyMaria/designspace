import { test, expect } from '@playwright/test';

test('library items render on canvas with seeded demo data', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });

  await page.goto('/?seed=demo', { waitUntil: 'networkidle' });
  await page.waitForTimeout(3000);
  await page.screenshot({ path: 'test-results/smoke-m1.png' });

  expect(errors, errors.join('\n')).toEqual([]);
});
