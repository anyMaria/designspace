import { test, expect } from '@playwright/test';

// Patch 1 · D4: #actions written in notes are listed in the right panel's Actions tab.
test('hashtags in two notes show up as one action group, and clicking a row goes to the note', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/', { waitUntil: 'networkidle' });

  for (const text of ['buy paint #dig-into', 'call the printer #dig-into']) {
    await page.getByRole('button', { name: 'Add', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Note', exact: true }).click();
    await page.waitForTimeout(300);
    await page.keyboard.type(text);
    await page.keyboard.press('Escape'); // closes and saves
    await page.waitForTimeout(300);
  }

  await page.getByRole('tab', { name: /^Actions 2$/ }).click();
  await expect(page.getByRole('button', { name: /#dig-into \(2\)/ })).toBeVisible();
  await page.getByRole('button', { name: /call the printer/ }).click();

  // The note is selected: the panel stays on Actions (selecting only notes doesn't open Details),
  // and Details shows the note's own panel.
  await page.getByRole('tab', { name: 'Details' }).click();
  await expect(page.getByRole('button', { name: 'Edit note' })).toBeVisible();
  await expect(page.getByText('#dig-into', { exact: true })).toBeVisible();

  // Search finds a hashtag.
  await page.keyboard.press('Control+k');
  await page.getByPlaceholder('Search your library…').fill('dig-into');
  await page.waitForTimeout(400);
  await expect(page.getByText(/^2 of 2$/)).toBeVisible();
});
