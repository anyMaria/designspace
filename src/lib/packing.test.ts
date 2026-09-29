import { describe, expect, it } from 'vitest';
import { findFreeSpot, justifiedRows } from './packing';
import { rectsIntersect, type Rect } from './geometry';

describe('justifiedRows', () => {
  it('packs a single item at the target row height', () => {
    const result = justifiedRows(
      [{ id: 'a', aspect: 1.5 }],
      { x: 0, y: 0 },
      { rowHeight: 240, gap: 16 },
    );
    expect(result).toEqual([{ id: 'a', x: 0, y: 0, w: 360, h: 240 }]);
  });

  it('wraps to a new row when the max width is exceeded', () => {
    const items = Array.from({ length: 6 }, (_, i) => ({ id: `${i}`, aspect: 1 }));
    const result = justifiedRows(
      items,
      { x: 0, y: 0 },
      { rowHeight: 240, gap: 16, maxRowWidth: 800 },
    );
    const rowCount = new Set(result.map((r) => r.y)).size;
    expect(rowCount).toBeGreaterThan(1);
  });

  it('rescales non-final rows to exactly fill maxRowWidth', () => {
    const items = [
      { id: 'a', aspect: 1 },
      { id: 'b', aspect: 1 },
      { id: 'c', aspect: 1 },
    ];
    const result = justifiedRows(
      items,
      { x: 0, y: 0 },
      { rowHeight: 240, gap: 16, maxRowWidth: 500 },
    );
    // Force a wrap so the first row is non-final and gets rescaled.
    const firstRowY = result[0].y;
    const firstRow = result.filter((r) => r.y === firstRowY);
    if (firstRow.length < items.length) {
      const totalW = firstRow.reduce((s, r) => s + r.w, 0) + 16 * (firstRow.length - 1);
      expect(totalW).toBeCloseTo(500, 0);
    }
  });

  it('preserves aspect ratio for every item', () => {
    const items = [
      { id: 'wide', aspect: 2 },
      { id: 'tall', aspect: 0.5 },
    ];
    const result = justifiedRows(
      items,
      { x: 0, y: 0 },
      { rowHeight: 240, gap: 16, maxRowWidth: 4000 },
    );
    for (const r of result) {
      const src = items.find((i) => i.id === r.id)!;
      expect(r.w / r.h).toBeCloseTo(src.aspect, 5);
    }
  });

  it('returns an empty layout for no items', () => {
    expect(justifiedRows([], { x: 0, y: 0 })).toEqual([]);
  });
});

describe('findFreeSpot', () => {
  const noneOccupied = () => false;

  it('returns the target centered when nothing is occupied', () => {
    const spot = findFreeSpot({ x: 100, y: 100 }, { w: 40, h: 40 }, noneOccupied);
    expect(spot).toEqual({ x: 80, y: 80 });
  });

  it('spirals outward to find a free spot when the target is occupied', () => {
    const occupiedRect: Rect = { x: 0, y: 0, w: 100, h: 100 };
    const isOccupied = (rect: Rect) => rectsIntersect(rect, occupiedRect);

    const spot = findFreeSpot({ x: 50, y: 50 }, { w: 20, h: 20 }, isOccupied);
    const resultRect: Rect = { x: spot.x, y: spot.y, w: 20, h: 20 };
    expect(rectsIntersect(resultRect, occupiedRect)).toBe(false);
  });

  it('finds distinct spots for successive placements against a growing occupancy set', () => {
    const placed: Rect[] = [];
    const isOccupied = (rect: Rect) => placed.some((p) => rectsIntersect(rect, p));

    for (let i = 0; i < 5; i++) {
      const spot = findFreeSpot({ x: 0, y: 0 }, { w: 50, h: 50 }, isOccupied);
      const rect: Rect = { x: spot.x, y: spot.y, w: 50, h: 50 };
      for (const p of placed) expect(rectsIntersect(rect, p)).toBe(false);
      placed.push(rect);
    }
    expect(placed).toHaveLength(5);
  });
});
