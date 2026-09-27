/** Small rectangle helpers shared by packing, culling and the canvas engine. */

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function rectsIntersect(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

/** The smallest rect containing every input rect. Returns null for an empty list. */
export function unionRects(rects: Rect[]): Rect | null {
  if (rects.length === 0) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const r of rects) {
    minX = Math.min(minX, r.x);
    minY = Math.min(minY, r.y);
    maxX = Math.max(maxX, r.x + r.w);
    maxY = Math.max(maxY, r.y + r.h);
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

/** Scales `w`×`h` (preserving aspect ratio) so its long side equals `longSide`. */
export function fitLongSide(w: number, h: number, longSide: number): { w: number; h: number } {
  if (w <= 0 || h <= 0) return { w: longSide, h: longSide };
  const scale = w >= h ? longSide / w : longSide / h;
  return { w: w * scale, h: h * scale };
}
