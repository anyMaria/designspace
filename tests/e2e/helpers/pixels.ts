import { inflateSync } from 'node:zlib';
import type { Page } from '@playwright/test';

/** Reads one screen pixel (CSS px) by screenshotting a 1×1 clip and decoding that PNG. For a
 * single pixel every PNG row filter predicts 0, so the inflated bytes are [filter, r, g, b, a]. */
export async function pixelAt(page: Page, x: number, y: number): Promise<[number, number, number]> {
  const png = await page.screenshot({ clip: { x, y, width: 1, height: 1 } });
  const idat: Buffer[] = [];
  let pos = 8;
  while (pos < png.length) {
    const len = png.readUInt32BE(pos);
    const type = png.toString('ascii', pos + 4, pos + 8);
    if (type === 'IDAT') idat.push(png.subarray(pos + 8, pos + 8 + len));
    pos += 12 + len;
  }
  const raw = inflateSync(Buffer.concat(idat));
  return [raw[1], raw[2], raw[3]];
}

export function near(
  a: [number, number, number],
  b: [number, number, number],
  tol: number,
): boolean {
  return a.every((v, i) => Math.abs(v - b[i]) <= tol);
}

export async function waitForPixel(
  page: Page,
  x: number,
  y: number,
  test: (rgb: [number, number, number]) => boolean,
  timeoutMs = 30_000,
): Promise<[number, number, number]> {
  const start = Date.now();
  let last = await pixelAt(page, x, y);
  while (!test(last)) {
    if (Date.now() - start > timeoutMs)
      throw new Error(`pixel at ${x},${y} stayed ${last.join(',')}`);
    await page.waitForTimeout(500);
    last = await pixelAt(page, x, y);
  }
  return last;
}
