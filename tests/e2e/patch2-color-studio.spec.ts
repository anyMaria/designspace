import { test, expect, type Page } from '@playwright/test';

// Patch 2 · E: the Color studio — ways in, Space, lock, like, Save/Undo, kept liked colours,
// Contrast, and double-click to edit.
test.use({ viewport: { width: 1800, height: 900 } });

const studio = (page: Page) => page.getByRole('dialog', { name: 'Color studio' });
const spots = (page: Page) => studio(page).getByTestId('studio-spot');

async function openNewStudio(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Palette…', exact: true }).click();
  await expect(studio(page)).toBeVisible();
}

async function hexes(page: Page): Promise<(string | null)[]> {
  return spots(page).evaluateAll((els) => els.map((e) => e.getAttribute('data-hex')));
}

test('Color studio: generate, lock, like, save and undo, liked colours are kept', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });

  await page.goto('/', { waitUntil: 'networkidle' });
  await openNewStudio(page);
  await expect(spots(page)).toHaveCount(5);

  // Space makes new colours: a second proposal.
  const before = await hexes(page);
  await page.keyboard.press('Space');
  await expect(studio(page).getByText('Proposal 2 of 2')).toBeVisible();
  expect(await hexes(page)).not.toEqual(before);

  // Lock spot 1 (select it, press L); the next Space keeps it.
  await page.keyboard.press('1');
  await page.keyboard.press('l');
  const locked = (await hexes(page))[0];
  await page.keyboard.press('Space');
  await expect(studio(page).getByText('Proposal 3 of 3')).toBeVisible();
  expect((await hexes(page))[0]).toBe(locked);

  // Heart spot 2.
  await page.keyboard.press('2');
  await page.keyboard.press('h');
  await expect(studio(page).getByTestId('liked-count')).toHaveText('1');
  const liked = (await hexes(page))[1];

  // Save: a palette lands on the map; Undo removes it.
  await studio(page).getByRole('button', { name: 'Save palette' }).click();
  await expect(studio(page)).toBeHidden();
  await expect(page.getByRole('button', { name: 'Open in Color studio' })).toBeVisible();
  await page.mouse.click(300, 700); // empty canvas: focus the map
  await page.keyboard.press('Control+z');
  await expect(page.getByRole('button', { name: 'Open in Color studio' })).toBeHidden();

  // Reopen: the liked colour is still there, and after a reload too.
  await openNewStudio(page);
  await expect(studio(page).getByTestId('liked-color')).toHaveAttribute('aria-label', liked ?? '');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(2500);
  await page.reload({ waitUntil: 'networkidle' });
  await openNewStudio(page);
  await expect(studio(page).getByTestId('liked-count')).toHaveText('1');

  expect(errors, errors.join('\n')).toEqual([]);
});

test('Color studio: Contrast of black on white, and double-click opens a palette to edit', async ({
  page,
}) => {
  await page.goto('/', { waitUntil: 'networkidle' });
  await openNewStudio(page);

  // Make spot 1 black and spot 2 white on the Wheel tab.
  await studio(page).getByRole('tab', { name: 'Wheel' }).click();
  for (const [n, hex] of [
    [1, '000000'],
    [2, 'FFFFFF'],
  ] as const) {
    await spots(page)
      .nth(n - 1)
      .click();
    const field = studio(page).getByLabel('HEX', { exact: true });
    await field.fill(hex);
    await field.press('Enter');
  }
  await studio(page).getByRole('tab', { name: 'Contrast' }).click();
  await expect(studio(page).getByTestId('contrast-ratio')).toContainText('21 : 1');
  await expect(studio(page).getByTestId('contrast-pill').filter({ hasText: 'Passes' })).toHaveCount(
    4,
  );

  // Save, then double-click the new palette: the studio opens on it.
  await studio(page).getByRole('button', { name: 'Save palette' }).click();
  await expect(studio(page)).toBeHidden();
  const box = await page.locator('canvas').first().boundingBox();
  if (!box) throw new Error('canvas has no bounding box');
  await page.mouse.dblclick(box.x + box.width / 2, box.y + box.height / 2);
  await expect(studio(page)).toBeVisible();
  const h = await hexes(page);
  expect(h[0]?.toUpperCase()).toBe('#000000');
  expect(h[1]?.toUpperCase()).toBe('#FFFFFF');
});
