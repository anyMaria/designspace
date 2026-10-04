import { describe, expect, it } from 'vitest';
import { hitTest, normalizeRect, rectSelect } from './selection';

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
    expect(normalizeRect({ x: 100, y: 100 }, { x: 20, y: 30 })).toEqual({
      x: 20,
      y: 30,
      w: 80,
      h: 70,
    });
  });
});
