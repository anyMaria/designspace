import { test, expect, type Page } from '@playwright/test';

// Patch 3 · A4: a picture dropped on the Color studio's "From an image" tab gives colours and is
// not added to the library; the tab keeps its layout on one line.
test.use({ viewport: { width: 1280, height: 720 } });

const studio = (page: Page) => page.getByRole('dialog', { name: 'Color studio' });

test('dropping a picture on From an image gives colours and adds nothing to the library', async ({
  page,
}) => {
  await page.goto('/', { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Palette…', exact: true }).click();
  await expect(studio(page)).toBeVisible();
  const tab = studio(page).getByRole('tab', { name: 'From an image' });
  await tab.click();

  // The tab label is on one line.
  const box = await tab.boundingBox();
  expect(box?.height ?? 999).toBeLessThan(48);

  // Drop a generated PNG on the drop zone.
  await page.evaluate(async () => {
    const canvas = document.createElement('canvas');
    canvas.width = 120;
    canvas.height = 80;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('no 2d context');
    ctx.fillStyle = '#d33';
    ctx.fillRect(0, 0, 60, 80);
    ctx.fillStyle = '#39c';
    ctx.fillRect(60, 0, 60, 80);
    const blob = await new Promise<Blob>((resolve) =>
      canvas.toBlob((b) => resolve(b as Blob), 'image/png'),
    );
    const data = new DataTransfer();
    data.items.add(new File([blob], 'two-colours.png', { type: 'image/png' }));
    const area = document.querySelector('[data-testid="studio-image-area"]');
    if (!area) throw new Error('no drop area');
    area.dispatchEvent(
      new DragEvent('dragover', { dataTransfer: data, bubbles: true, cancelable: true }),
    );
    area.dispatchEvent(
      new DragEvent('drop', { dataTransfer: data, bubbles: true, cancelable: true }),
    );
  });
  await expect(studio(page).getByTestId('dropper').first()).toBeVisible({ timeout: 10_000 });

  // Leave the studio without saving: nothing was imported.
  page.once('dialog', (d) => void d.accept());
  await page.keyboard.press('Escape');
  await expect(studio(page)).toBeHidden();
  await expect(page.getByText('Nothing here yet.')).toBeVisible();
});
