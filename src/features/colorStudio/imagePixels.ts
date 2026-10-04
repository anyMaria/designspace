/** Scales `w × h` so the long side is at most `max` (never up), keeping the proportions. */
export function fitWithin(w: number, h: number, max: number): { width: number; height: number } {
  if (w <= 0 || h <= 0) return { width: 0, height: 0 };
  const scale = Math.min(1, max / Math.max(w, h));
  return { width: Math.max(1, Math.round(w * scale)), height: Math.max(1, Math.round(h * scale)) };
}

export interface LoadedPixels {
  pixels: Uint8ClampedArray;
  width: number;
  height: number;
  bitmap: ImageBitmap;
}

/** Decodes a picture and reads its pixels at a size where the long side is at most `maxSide`
 * (Patch 2 · E4): enough to pick colours from, cheap to scan. */
export async function loadPixels(blob: Blob, maxSide = 512): Promise<LoadedPixels> {
  const bitmap = await createImageBitmap(blob);
  const { width, height } = fitWithin(bitmap.width, bitmap.height, maxSide);
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('No 2D canvas available');
  ctx.drawImage(bitmap, 0, 0, width, height);
  const { data } = ctx.getImageData(0, 0, width, height);
  return { pixels: data, width, height, bitmap };
}
