import { test, expect } from '@playwright/test';

test('empty-state + Add opens the add menu, and Settings Canvas/Library sections work', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });

  // No ?seed=demo — an empty library, so the centered empty-state card should show.
  await page.goto('/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);

  await expect(
    page.getByText('Drop images anywhere, paste with Ctrl+V, or press + Add.'),
  ).toBeVisible();
  await page.screenshot({ path: 'test-results/empty-state.png' });

  await page.getByRole('button', { name: '+ Add' }).click();
  await expect(page.getByRole('menuitem', { name: 'Files…' })).toBeVisible();
  await page.keyboard.press('Escape');

  // Settings -> Canvas: flip wheel mode, dot grid density and reduce motion; toggle minimap.
  await page.getByRole('button', { name: 'Settings' }).click();
  await page.getByRole('button', { name: 'Canvas', exact: true }).click();
  await page.waitForTimeout(200);
  await page.getByRole('tab', { name: 'Pan' }).click();
  await page.getByRole('tab', { name: 'Wide' }).click();
  await page.getByRole('tab', { name: 'On', exact: true }).click();
  await page.getByRole('switch', { name: 'Minimap' }).click();
  await page.screenshot({ path: 'test-results/settings-canvas.png' });

  // Settings -> Library: the browser build shows the "not available" note (the Trash moved out, C5).
  await page.getByRole('button', { name: 'Library', exact: true }).click();
  await page.waitForTimeout(200);
  await expect(page.getByText('Not available in the browser dev build')).toBeVisible();
  await page.screenshot({ path: 'test-results/settings-library.png' });

  // A short window must not cut Settings off: About stays reachable (Patch 2 · A9).
  await page.setViewportSize({ width: 1280, height: 600 });
  await page.getByRole('button', { name: 'About', exact: true }).click();
  await expect(page.getByText('Version')).toBeInViewport();

  expect(errors, errors.join('\n')).toEqual([]);
});
