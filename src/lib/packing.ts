import type { Rect } from './geometry';

export interface PackedItem {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface JustifiedRowsOptions {
  rowHeight?: number;
  gap?: number;
  maxRowWidth?: number;
}

/**
 * Justified-row layout for a compact grid of items with known aspect ratios — §4.9 (multi-item
 * drops, "Tidy up", new boards). Target row height 240, 16px gaps, aspect ratios preserved; every
 * row but the last is rescaled to exactly fill `maxRowWidth`.
 */
export function justifiedRows(
  items: { id: string; aspect: number }[],
  origin: { x: number; y: number },
  opts: JustifiedRowsOptions = {},
): PackedItem[] {
  const rowHeight = opts.rowHeight ?? 240;
  const gap = opts.gap ?? 16;
  const maxRowWidth = opts.maxRowWidth ?? 1600;

  const rows: { id: string; aspect: number }[][] = [];
  let current: { id: string; aspect: number }[] = [];
  let currentWidth = 0;

  for (const item of items) {
    const width = item.aspect * rowHeight;
    const prospectiveWidth = currentWidth + (current.length > 0 ? gap : 0) + width;
    if (current.length > 0 && prospectiveWidth > maxRowWidth) {
      rows.push(current);
      current = [];
      currentWidth = 0;
    }
    currentWidth += (current.length > 0 ? gap : 0) + width;
    current.push(item);
  }
  if (current.length > 0) rows.push(current);

  const result: PackedItem[] = [];
  let y = origin.y;

  rows.forEach((row, rowIndex) => {
    const isLastRow = rowIndex === rows.length - 1;
    const totalAspect = row.reduce((sum, item) => sum + item.aspect, 0);
    const totalGap = gap * (row.length - 1);
    const naturalRowWidth = totalAspect * rowHeight;
    const scale = isLastRow ? 1 : (maxRowWidth - totalGap) / naturalRowWidth;
    const h = rowHeight * scale;

    let x = origin.x;
    for (const item of row) {
      const w = item.aspect * h;
      result.push({ id: item.id, x, y, w, h });
      x += w + gap;
    }
    y += h + gap;
  });

  return result;
}

export interface FindFreeSpotOptions {
  /** Distance between spiral rings, in world units. Defaults to the candidate's longer side. */
  step?: number;
  maxRadius?: number;
  /** Radians advanced per spiral sample. */
  angleStep?: number;
}

/**
 * The "arrival area" free-space search (§4.9): spirals outward from `target` and returns the
 * first position where a `size`-shaped rect doesn't overlap anything `isOccupied` reports.
 * `isOccupied` is injected (backed by the canvas's rbush index in practice) so this stays pure.
 */
export function findFreeSpot(
  target: { x: number; y: number },
  size: { w: number; h: number },
  isOccupied: (rect: Rect) => boolean,
  opts: FindFreeSpotOptions = {},
): { x: number; y: number } {
  const step = opts.step ?? Math.max(size.w, size.h) * 0.6;
  const maxRadius = opts.maxRadius ?? step * 200;
  const angleStep = opts.angleStep ?? 0.5;

  const topLeftFor = (cx: number, cy: number): Rect => ({
    x: cx - size.w / 2,
    y: cy - size.h / 2,
    w: size.w,
    h: size.h,
  });

  let candidate = topLeftFor(target.x, target.y);
  if (!isOccupied(candidate)) return { x: candidate.x, y: candidate.y };

  let angle = 0;
  let radius = step;
  while (radius < maxRadius) {
    const cx = target.x + radius * Math.cos(angle);
    const cy = target.y + radius * Math.sin(angle);
    candidate = topLeftFor(cx, cy);
    if (!isOccupied(candidate)) return { x: candidate.x, y: candidate.y };

    angle += angleStep;
    if (angle >= Math.PI * 2) {
      angle = 0;
      radius += step;
    }
  }
  // Give up gracefully rather than looping forever — the caller can still place the item here.
  return { x: candidate.x, y: candidate.y };
}
