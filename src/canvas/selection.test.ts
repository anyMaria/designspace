import { describe, expect, it } from 'vitest';
import { hitTest, normalizeRect, rectSelect, resizeHandleAt, resizeWithAspect } from './selection';

const a = { id: 'a', x: 0, y: 0, w: 100, h: 100, z: 0 };
const b = { id: 'b', x: 50, y: 50, w: 100, h: 100, z: 1 };

describe('hitTest', () => {
  it('returns null when nothing is under the point', () => {
    expect(hitTest([a, b], { x: 500, y: 500 })).toBeNull();
  });

  it('returns the single item under the point', () => {
    expect(hitTest([a, b], { x: 10, y: 10 })).toBe(a);
  });

  it('returns the topmost (highest z) item when overlapping', () => {
    expect(hitTest([a, b], { x: 75, y: 75 })).toBe(b);
  });
});

describe('rectSelect', () => {
  it('selects every item intersecting the marquee', () => {
    const result = rectSelect([a, b], { x: 40, y: 40, w: 20, h: 20 });
    expect(result.map((i) => i.id).sort()).toEqual(['a', 'b']);
  });

  it('excludes items entirely outside the marquee', () => {
    const result = rectSelect([a, b], { x: 1000, y: 1000, w: 10, h: 10 });
    expect(result).toEqual([]);
  });
});

describe('normalizeRect', () => {
  it('normalizes a drag from bottom-right to top-left', () => {
    expect(normalizeRect({ x: 100, y: 100 }, { x: 20, y: 30 })).toEqual({ x: 20, y: 30, w: 80, h: 70 });
  });
});

describe('resizeHandleAt', () => {
  const bounds = { x: 0, y: 0, w: 200, h: 100 };

  it('detects each corner within the handle size', () => {
    expect(resizeHandleAt(bounds, { x: 0, y: 0 }, 10)).toBe('nw');
    expect(resizeHandleAt(bounds, { x: 200, y: 0 }, 10)).toBe('ne');
    expect(resizeHandleAt(bounds, { x: 0, y: 100 }, 10)).toBe('sw');
    expect(resizeHandleAt(bounds, { x: 200, y: 100 }, 10)).toBe('se');
  });

  it('returns null away from any corner', () => {
    expect(resizeHandleAt(bounds, { x: 100, y: 50 }, 10)).toBeNull();
  });
});

describe('resizeWithAspect', () => {
  it('keeps the aspect ratio when dragging the se handle', () => {
    const bounds = { x: 0, y: 0, w: 200, h: 100 }; // aspect 2
    const result = resizeWithAspect(bounds, 'se', { x: 400, y: 250 });
    expect(result.x).toBe(0);
    expect(result.y).toBe(0);
    expect(result.w / result.h).toBeCloseTo(2, 5);
  });

  it('keeps the opposite corner anchored when dragging nw', () => {
    const bounds = { x: 100, y: 100, w: 200, h: 100 };
    const result = resizeWithAspect(bounds, 'nw', { x: 50, y: 50 });
    // The se anchor (300, 200) must stay fixed.
    expect(result.x + result.w).toBeCloseTo(300, 5);
    expect(result.y + result.h).toBeCloseTo(200, 5);
  });

  it('never shrinks below the minimum size', () => {
    const bounds = { x: 0, y: 0, w: 200, h: 100 };
    const result = resizeWithAspect(bounds, 'se', { x: 1, y: 1 }, 24);
    expect(result.w).toBeGreaterThanOrEqual(24);
  });
});
