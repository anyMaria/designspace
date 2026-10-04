import { test, expect } from '@playwright/test';

// Patch 2 · A1: when nothing can connect, the Connections popover says why.
test('the Connections popover explains when nothing shares a Vibe or Tag', async ({ page }) => {
  await page.goto('/');
  await page.locator('canvas').first().waitFor();
  await page.locator('input[type=file]').first().setInputFiles('tests/e2e/fixtures/red-square.png');
  await page.keyboard.press('Escape');

  await page.getByRole('button', { name: 'Connections' }).click();
  await expect(page.getByTestId('connections-summary')).toContainText(
    'Nothing shares a Vibe or Tag yet.',
  );
});
