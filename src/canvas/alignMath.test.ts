import { describe, expect, it } from 'vitest';
import { align, distribute, matchSize, type AlignRect, type SizeEntry } from './alignMath';

const rect = (id: string, x: number, y: number, w: number, h: number): AlignRect => ({
  id,
  x,
  y,
  w,
  h,
});
const rects = [rect('a', 0, 10, 100, 50), rect('b', 200, 40, 60, 80), rect('c', 400, 0, 40, 20)];

describe('align', () => {
  it('left / right use the selection bounds', () => {
    expect(align(rects, 'left')).toEqual([
      { id: 'b', x: 0, y: 40 },
      { id: 'c', x: 0, y: 0 },
    ]);
    expect(align(rects, 'right')).toEqual([
      { id: 'a', x: 340, y: 10 },
      { id: 'b', x: 380, y: 40 },
    ]);
  });
  it('centres horizontally and vertically', () => {
    const h = align(rects, 'hcenter');
    expect(h.find((u) => u.id === 'a')).toEqual({ id: 'a', x: 170, y: 10 });
    const v = align(rects, 'vcenter');
    expect(v.find((u) => u.id === 'c')).toEqual({ id: 'c', x: 400, y: 50 });
  });
  it('top and bottom', () => {
    expect(align(rects, 'top').map((u) => u.y)).toEqual([0, 0]);
    expect(align(rects, 'bottom').find((u) => u.id === 'c')?.y).toBe(100);
  });
  it('does nothing for fewer than two', () => {
    expect(align([rects[0]], 'left')).toEqual([]);
  });
});

describe('distribute', () => {
  it('makes the gaps equal and keeps the first and last, even with unequal sizes', () => {
    const items = [rect('a', 0, 0, 100, 10), rect('b', 130, 0, 20, 10), rect('c', 400, 0, 50, 10)];
    const out = distribute(items, 'x');
    // span 450, sizes 170, gap (450-170)/2 = 140 → b at 100+140 = 240
    expect(out).toEqual([{ id: 'b', x: 240, y: 0 }]);
  });
  it('works vertically and orders by position, not by input order', () => {
    const items = [
      rect('c', 0, 300, 10, 100),
      rect('a', 0, 0, 10, 100),
      rect('b', 0, 120, 10, 100),
    ];
    const out = distribute(items, 'y');
    // span 400, sizes 300, gap 50 → b at 150
    expect(out).toEqual([{ id: 'b', x: 0, y: 150 }]);
  });
  it('needs three', () => {
    expect(distribute([rects[0], rects[1]], 'x')).toEqual([]);
  });
});

describe('matchSize', () => {
  const entry = (
    id: string,
    kind: SizeEntry['kind'],
    w: number,
    h: number,
    cropX: number | null = null,
  ): SizeEntry => ({ id, kind, x: 5, y: 6, w, h, cropX });

  it('pictures take the width and are marked cropped', () => {
    const out = matchSize([entry('a', 'image', 200, 100), entry('b', 'image', 100, 100)], 'w');
    expect(out).toEqual([{ id: 'b', x: 5, y: 6, w: 200, h: 100, cropX: 0.5, cropY: 0.5 }]);
  });
  it('keeps an existing crop focus', () => {
    const out = matchSize([entry('a', 'image', 200, 100), entry('b', 'image', 100, 100, 0.2)], 'h');
    expect(out).toEqual([]); // heights already equal
    const w = matchSize([entry('a', 'image', 200, 100), entry('b', 'image', 100, 100, 0.2)], 'w');
    expect(w[0].cropX).toBeUndefined();
  });
  it('fonts keep their proportions', () => {
    const out = matchSize([entry('a', 'image', 200, 100), entry('f', 'font', 100, 50)], 'w');
    expect(out).toEqual([{ id: 'f', x: 5, y: 6, w: 200, h: 100 }]);
  });
  it('leaves palettes alone and never changes the reference', () => {
    const out = matchSize(
      [entry('a', 'image', 200, 100), entry('s', 'swatch', 50, 50), entry('n', 'note', 10, 80)],
      'w',
    );
    expect(out.map((u) => u.id)).toEqual(['n']);
    expect(out[0]).toEqual({ id: 'n', x: 5, y: 6, w: 200, h: 80 });
  });
  it('uses the chosen reference', () => {
    const out = matchSize([entry('a', 'image', 200, 100), entry('b', 'image', 100, 100)], 'w', 'b');
    expect(out.map((u) => u.id)).toEqual(['a']);
  });
});
