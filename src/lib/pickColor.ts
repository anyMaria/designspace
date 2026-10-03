/** Reading one colour out of a picture, for "Pick from a photo" (Patch 1 · C4). */

export function rgbToHex(r: number, g: number, b: number): string {
  const part = (n: number) =>
    Math.max(0, Math.min(255, Math.round(n)))
      .toString(16)
      .padStart(2, '0');
  return `#${part(r)}${part(g)}${part(b)}`.toUpperCase();
}

/** The pixel (column, row) for a point given as fractions (u, v in 0–1) of a width × height image. */
export function pixelAtUv(
  u: number,
  v: number,
  width: number,
  height: number,
): { x: number; y: number } {
  const clamp = (n: number, max: number) => Math.max(0, Math.min(max - 1, Math.floor(n * max)));
  return { x: clamp(u, width), y: clamp(v, height) };
}

/** Loads an image URL (a cached thumbnail) and returns the colour at (u, v), or null on failure. */
export async function colorAtUrl(url: string, u: number, v: number): Promise<string | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const bitmap = await createImageBitmap(await res.blob());
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(bitmap, 0, 0);
    const { x, y } = pixelAtUv(u, v, bitmap.width, bitmap.height);
    const [r, g, b] = ctx.getImageData(x, y, 1, 1).data;
    bitmap.close();
    return rgbToHex(r, g, b);
  } catch {
    return null;
  }
}
