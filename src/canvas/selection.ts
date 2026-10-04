import type { Rect } from '@/lib/geometry';
import { rectsIntersect } from '@/lib/geometry';

export interface HitTestable {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  z: number;
}

/** Topmost item (highest z, ties broken by later in the array) containing `point`, or null. */
export function hitTest<T extends HitTestable>(
  items: T[],
  point: { x: number; y: number },
): T | null {
  let best: T | null = null;
  for (const item of items) {
    const inside =
      point.x >= item.x &&
      point.x <= item.x + item.w &&
      point.y >= item.y &&
      point.y <= item.y + item.h;
    if (!inside) continue;
    if (!best || item.z >= best.z) best = item;
  }
  return best;
}

/** Every item whose bounds intersect the marquee rect — used for drag-to-select. */
export function rectSelect<T extends HitTestable>(items: T[], marquee: Rect): T[] {
  return items.filter((item) => rectsIntersect(item, marquee));
}

export function normalizeRect(a: { x: number; y: number }, b: { x: number; y: number }): Rect {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return { x, y, w: Math.abs(a.x - b.x), h: Math.abs(a.y - b.y) };
}
