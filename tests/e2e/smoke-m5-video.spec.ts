import { test, expect } from '@playwright/test';

test('importing a video shows a thumbnail once ingest finishes, and Focus view plays it', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });

  await page.goto('/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);

  const fileChooserPromise = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Files…' }).click();
  const chooser = await fileChooserPromise;
  await chooser.setFiles('tests/e2e/fixtures/sample.webm');

  // Video ingest runs on the main thread (a real <video> element, not a Worker — see
  // docs/DECISIONS.md) and needs to load metadata, seek to the poster frame and draw two
  // thumbnail sizes; give it more room than an image import.
  await page.waitForTimeout(4000);

  // The item made it in and its thumbnail loaded (status became 'ok' and the cache URL resolved)
  // — the List panel is the simplest DOM-visible proof of that.
  await page.getByRole('tab', { name: 'List' }).click();
  const tile = page.locator('button.ds-list-tile');
  await expect(tile).toHaveCount(1);
  await expect(tile.locator('img')).toBeVisible();

  // Double-click the canvas card opens Focus view's video player (a real DOM <video>, unlike the
  // canvas-rendered duration badge/hover preview, which Playwright can't inspect directly).
  const canvas = page.locator('canvas').first();
  const box = await canvas.boundingBox();
  if (!box) throw new Error('canvas not found');
  await page.mouse.dblclick(box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForTimeout(500);

  const video = page.locator('video');
  await expect(video).toBeVisible();
  await expect(video).toHaveAttribute('controls', '');
  const duration = await video.evaluate(
    (el: HTMLVideoElement) =>
      new Promise<number>((resolve) => {
        if (el.readyState >= 1) resolve(el.duration);
        else el.addEventListener('loadedmetadata', () => resolve(el.duration), { once: true });
      }),
  );
  expect(duration).toBeGreaterThan(0);
  expect(duration).toBeLessThan(3); // the fixture is a 1s clip

  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  await expect(video).toBeHidden();

  expect(errors, errors.join('\n')).toEqual([]);
});
