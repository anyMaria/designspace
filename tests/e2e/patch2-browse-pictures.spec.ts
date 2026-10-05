import { test, expect } from '@playwright/test';

// Shift+Space goes to the next picture, Ctrl+Space to the previous one.
test.use({ viewport: { width: 1800, height: 900 } });

test('Shift+Space and Ctrl+Space walk through the pictures on the map', async ({ page }) => {
  await page.goto('/?seed=demo', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  // The selected picture's title, from the Details panel.
  await page.getByRole('tab', { name: 'Details' }).click();
  const rect = async () => {
    await page.waitForTimeout(500);
    return page.getByLabel('Title', { exact: true }).inputValue();
  };

  await page.keyboard.press('Shift+Space');
  const first = await rect();
  expect(first).not.toBe('');
  await page.keyboard.press('Shift+Space');
  const second = await rect();
  expect(second).not.toBe(first);
  await page.keyboard.press('Shift+Space');
  expect(await rect()).not.toBe(second);
  await page.keyboard.press('Control+Space');
  expect(await rect()).toBe(second);
  await page.keyboard.press('Control+Space');
  expect(await rect()).toBe(first);
});
