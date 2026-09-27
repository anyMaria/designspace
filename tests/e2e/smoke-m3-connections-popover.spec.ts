import { test, expect } from '@playwright/test';

test('the Connections popover opens, toggles criteria (with the 3-active cap), and switches mode/strength/constellations', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });

  await page.goto('/?seed=demo', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);

  // Open via the "C" shortcut.
  const canvas = page.locator('canvas').first();
  await canvas.click();
  await page.keyboard.press('c');
  const popover = page.getByRole('dialog');
  await expect(popover).toBeVisible();

  // Defaults are Vibe, Tags, My connections (3 active) — a 4th (Type) should be rejected with
  // the limit message, not silently swap one out.
  await popover.getByRole('button', { name: 'Type' }).click();
  await expect(page.getByText('Up to 3 at a time. Turn one off first.')).toBeVisible();

  // Turning one off first, then the same toggle, should succeed.
  await popover.getByRole('button', { name: 'Vibe' }).click();
  await popover.getByRole('button', { name: 'Type' }).click();

  // Display mode: On hover -> Show all.
  await page.getByRole('tab', { name: 'Show all' }).click();

  // Strength: default 1 -> 2.
  await page.getByRole('tab', { name: '2', exact: true }).click();

  // Constellations switch.
  await page.getByRole('switch', { name: '✦ Constellations' }).click();

  await page.keyboard.press('Escape');
  await expect(popover).toBeHidden();

  expect(errors, errors.join('\n')).toEqual([]);
});
