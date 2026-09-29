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

export type ResizeHandle = 'nw' | 'ne' | 'sw' | 'se';

/** Which corner handle (if any) of `bounds` contains `point`, within `handleSize` world units. */
export function resizeHandleAt(
  bounds: Rect,
  point: { x: number; y: number },
  handleSize: number,
): ResizeHandle | null {
  const half = handleSize / 2;
  const corners: [ResizeHandle, number, number][] = [
    ['nw', bounds.x, bounds.y],
    ['ne', bounds.x + bounds.w, bounds.y],
    ['sw', bounds.x, bounds.y + bounds.h],
    ['se', bounds.x + bounds.w, bounds.y + bounds.h],
  ];
  for (const [handle, cx, cy] of corners) {
    if (Math.abs(point.x - cx) <= half && Math.abs(point.y - cy) <= half) return handle;
  }
  return null;
}

/** Resizes `bounds` by dragging `handle` to `point`, preserving aspect ratio (media kinds keep
 * their aspect ratio — §2.2). Returns the new rect, with a minimum size floor. */
export function resizeWithAspect(
  bounds: Rect,
  handle: ResizeHandle,
  point: { x: number; y: number },
  minSize = 24,
): Rect {
  const aspect = bounds.w / bounds.h;
  const anchor =
    handle === 'nw'
      ? { x: bounds.x + bounds.w, y: bounds.y + bounds.h }
      : handle === 'ne'
        ? { x: bounds.x, y: bounds.y + bounds.h }
        : handle === 'sw'
          ? { x: bounds.x + bounds.w, y: bounds.y }
          : { x: bounds.x, y: bounds.y };

  const dx = Math.abs(point.x - anchor.x);
  const dy = Math.abs(point.y - anchor.y);
  // Drive the resize off whichever axis moved more, then derive the other from the aspect ratio.
  let w = dx >= dy * aspect ? dx : dy * aspect;
  w = Math.max(minSize, w);
  const h = w / aspect;

  const isLeft = handle === 'nw' || handle === 'sw';
  const isTop = handle === 'nw' || handle === 'ne';
  return {
    x: isLeft ? anchor.x - w : anchor.x,
    y: isTop ? anchor.y - h : anchor.y,
    w,
    h,
  };
}
