import { test, expect, type Page } from '@playwright/test';

// Patch 3 · A1: Ctrl+V must read the clipboard text before any `await`, so a copied link becomes
// a Link and plain text becomes a note.
async function pasteText(page: Page, text: string) {
  await page.evaluate((value) => {
    const data = new DataTransfer();
    data.setData('text/plain', value);
    const event = new ClipboardEvent('paste', {
      clipboardData: data,
      bubbles: true,
      cancelable: true,
    });
    document.body.dispatchEvent(event);
  }, text);
}

test('pasting a link makes a Link card and pasting text makes a note', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Add', exact: true })).toBeVisible();

  await pasteText(page, 'https://example.com/some/page');
  await expect(page.getByRole('tab', { name: 'List' })).toBeVisible();
  await page.keyboard.press('Escape');
  await page.getByRole('tab', { name: 'List' }).click();
  await expect(page.locator('button.ds-list-tile').getByText('example.com').first()).toBeVisible({
    timeout: 15_000,
  });

  await pasteText(page, 'hello from the clipboard');
  await expect(
    page.locator('button.ds-list-tile').getByText('hello from the clipboard'),
  ).toBeVisible({
    timeout: 15_000,
  });
});
