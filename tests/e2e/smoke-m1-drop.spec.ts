import { test, expect } from '@playwright/test';

test('dragging a file over the canvas shows the drop overlay, and dropping it imports', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });

  await page.goto('/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);

  const buffer = await page.evaluate(() => {
    const b64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    const binary = atob(b64);
    return Array.from(binary, (c) => c.charCodeAt(0));
  });

  await page.evaluate((bytes) => {
    const file = new File([new Uint8Array(bytes)], 'dropped.png', { type: 'image/png' });
    const dt = new DataTransfer();
    dt.items.add(file);
    const target = document.body;
    target.dispatchEvent(new DragEvent('dragenter', { dataTransfer: dt, bubbles: true }));
    target.dispatchEvent(new DragEvent('dragover', { dataTransfer: dt, bubbles: true, cancelable: true }));
  }, buffer);

  await page.waitForTimeout(300);
  await page.screenshot({ path: 'test-results/drop-overlay.png' });
  await expect(page.getByText('Drop to add')).toBeVisible();

  await page.evaluate((bytes) => {
    const file = new File([new Uint8Array(bytes)], 'dropped.png', { type: 'image/png' });
    const dt = new DataTransfer();
    dt.items.add(file);
    document.body.dispatchEvent(
      new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true, clientX: 400, clientY: 300 }),
    );
  }, buffer);

  await page.waitForTimeout(1500);
  await page.screenshot({ path: 'test-results/after-drop.png' });

  expect(errors, errors.join('\n')).toEqual([]);
});
