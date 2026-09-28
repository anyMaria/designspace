import { test, expect } from '@playwright/test';

test('the Link… dialog (Ctrl+L) adds a domain-only card in the browser dev build (net.enabled() is false), and Focus view opens it', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });

  await page.goto('/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);

  // Ctrl+L opens the Link… dialog directly, without going through the Add menu.
  await page.keyboard.press('Control+l');
  const urlInput = page.getByPlaceholder('https://example.com');
  await expect(urlInput).toBeVisible();
  await urlInput.fill('https://example.com/some-article');
  await page.getByRole('dialog').getByRole('button', { name: 'Add', exact: true }).click();
  await page.waitForTimeout(500);

  await page.getByRole('tab', { name: 'List' }).click();
  const tile = page.locator('button.ds-list-tile');
  await expect(tile).toHaveCount(1);

  const canvas = page.locator('canvas').first();
  const box = await canvas.boundingBox();
  if (!box) throw new Error('canvas not found');
  await page.mouse.dblclick(box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForTimeout(300);

  // The domain-only Focus view: no cover fetched (net.enabled() is false in the browser dev
  // build), so it shows the plain domain card, title/URL text, and "Open in browser".
  await expect(page.getByText('example.com', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('https://example.com/some-article')).toBeVisible();
  const openButton = page.getByRole('button', { name: 'Open in browser' });
  await expect(openButton).toBeVisible();

  // This sandbox has no route to the public internet, so the popup itself will fail to load —
  // what matters here is that "Open in browser" requested the *right* URL, which the browser
  // context's own `request` event captures regardless of how that request eventually resolves.
  let requestedUrl: string | null = null;
  page.context().once('request', (req) => {
    requestedUrl = req.url();
  });
  await openButton.click();
  await page.waitForTimeout(300);
  expect(requestedUrl).toBe('https://example.com/some-article');

  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  await expect(openButton).toBeHidden();

  expect(errors, errors.join('\n')).toEqual([]);
});
