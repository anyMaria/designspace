import { describe, expect, it } from 'vitest';
import { SpatialIndex } from './spatialIndex';

describe('SpatialIndex', () => {
  it('returns only ids whose bounds intersect the query rect', () => {
    const index = new SpatialIndex();
    index.load([
      { id: 'a', x: 0, y: 0, w: 10, h: 10 },
      { id: 'b', x: 100, y: 100, w: 10, h: 10 },
      { id: 'c', x: 500, y: 500, w: 10, h: 10 },
    ]);

    const hits = index.queryIds({ x: -5, y: -5, w: 20, h: 20 });
    expect(hits).toEqual(new Set(['a']));
  });

  it('finds items that only partially overlap the query rect', () => {
    const index = new SpatialIndex();
    index.load([{ id: 'a', x: 0, y: 0, w: 100, h: 100 }]);
    const hits = index.queryIds({ x: 50, y: 50, w: 500, h: 500 });
    expect(hits.has('a')).toBe(true);
  });

  it('load() replaces the previous contents', () => {
    const index = new SpatialIndex();
    index.load([{ id: 'a', x: 0, y: 0, w: 10, h: 10 }]);
    index.load([{ id: 'b', x: 0, y: 0, w: 10, h: 10 }]);
    const hits = index.queryIds({ x: 0, y: 0, w: 10, h: 10 });
    expect(hits).toEqual(new Set(['b']));
  });

  it('clear() empties the index', () => {
    const index = new SpatialIndex();
    index.load([{ id: 'a', x: 0, y: 0, w: 10, h: 10 }]);
    index.clear();
    expect(index.queryIds({ x: -1000, y: -1000, w: 5000, h: 5000 }).size).toBe(0);
  });

  it('handles a bench-sized load (10,000 rects) and returns a bounded viewport subset', () => {
    const index = new SpatialIndex();
    const items = Array.from({ length: 10_000 }, (_, i) => ({
      id: `item-${i}`,
      x: (i % 100) * 400,
      y: Math.floor(i / 100) * 400,
      w: 320,
      h: 400,
    }));
    index.load(items);
    const hits = index.queryIds({ x: 0, y: 0, w: 1600, h: 1200 });
    expect(hits.size).toBeGreaterThan(0);
    expect(hits.size).toBeLessThan(items.length);
  });
});
