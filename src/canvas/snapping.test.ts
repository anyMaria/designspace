import { describe, expect, it } from 'vitest';
import { snapMove, snapResize } from './snapping';
import type { Rect } from '@/lib/geometry';

const r = (x: number, y: number, w: number, h: number): Rect => ({ x, y, w, h });
const T = 6;

describe('snapMove', () => {
  it('snaps edge to edge', () => {
    const res = snapMove(r(103, 300, 50, 50), [r(0, 0, 100, 100)], T);
    expect(res.dx).toBe(-3); // moving.left → other.right
    expect(res.dy).toBe(0);
    expect(res.guides.some((g) => g.axis === 'x' && g.at === 100)).toBe(true);
  });

  it('snaps the top edge of a neighbour (the card sits 4 px low)', () => {
    const res = snapMove(r(200, 104, 80, 60), [r(0, 100, 100, 100)], T);
    expect(res.dy).toBe(-4);
    expect(res.dx).toBe(0);
    expect(res.guides.some((g) => g.axis === 'y' && g.at === 100)).toBe(true);
  });

  it('snaps centre to centre', () => {
    // moving centre x = 50+? other centre x = 100
    const res = snapMove(r(72, 400, 56, 40), [r(50, 0, 100, 100)], T);
    expect(res.dx).toBe(0); // centres already equal at x = 100
    const res2 = snapMove(r(75, 400, 56, 40), [r(50, 0, 100, 100)], T);
    expect(res2.dx).toBe(-3);
    expect(res2.dy).toBe(0);
  });

  it('does nothing when nothing is within the threshold', () => {
    const res = snapMove(r(300, 300, 50, 50), [r(0, 0, 100, 100)], T);
    expect(res).toEqual({ dx: 0, dy: 0, guides: [], gaps: [] });
  });

  it('snaps x and y at the same time', () => {
    const res = snapMove(r(103, 97, 50, 50), [r(0, 0, 100, 100)], T);
    expect(res.dx).toBe(-3);
    expect(res.dy).toBe(3);
  });

  it('takes the smallest correction on an axis', () => {
    const res = snapMove(r(104, 500, 50, 50), [r(0, 0, 100, 100), r(110, 200, 10, 10)], T);
    // moving.left (104) is 4 from 100 (right of A) and 6 from 110 (left of B): A wins
    expect(res.dx).toBe(-4);
  });

  it('prefers an edge over a centre on a tie', () => {
    // edge match needs -3; centre match also needs -3
    const res = snapMove(r(103, 500, 50, 50), [r(0, 0, 100, 100), r(66, 200, 50, 10)], T);
    expect(res.dx).toBe(-3);
    expect(res.guides.find((g) => g.axis === 'x')?.at).toBe(100);
  });

  it('snaps to an equal gap to the right of a pair', () => {
    // A [0..100], B [150..250]: gap 50. Moving should sit 50 right of B → x = 300.
    const others = [r(0, 0, 100, 100), r(150, 0, 100, 100)];
    const res = snapMove(r(303, 10, 100, 80), others, T);
    expect(res.dx).toBe(-3);
    expect(res.gaps).toHaveLength(1);
    expect(res.gaps[0].axis).toBe('x');
    expect(res.gaps[0].gaps).toHaveLength(2);
    expect(res.gaps[0].gaps.map((g) => g.end - g.start)).toEqual([50, 50]);
  });

  it('snaps to an equal gap to the left of a pair', () => {
    const others = [r(300, 0, 100, 100), r(450, 0, 100, 100)];
    // pair gap 50; moving 100 wide should end 50 left of x=300 → x = 150
    const res = snapMove(r(147, 10, 100, 80), others, T);
    expect(res.dx).toBe(3);
  });

  it('centres between two neighbours', () => {
    const others = [r(0, 0, 100, 100), r(300, 0, 100, 100)];
    // room between 100 and 300 = 200; a 60-wide card centres at x = 170
    const res = snapMove(r(173, 20, 60, 60), others, T);
    expect(res.dx).toBe(-3);
    expect(res.gaps[0].gaps.map((g) => g.end - g.start)).toEqual([70, 70]);
  });

  it('does not use cards from another row for gaps', () => {
    const others = [r(0, 0, 100, 100), r(150, 0, 100, 100)];
    const res = snapMove(r(303, 400, 100, 80), others, T);
    expect(res.gaps).toHaveLength(0);
  });

  it('works in columns too', () => {
    const others = [r(0, 0, 100, 100), r(0, 150, 100, 100)];
    const res = snapMove(r(10, 303, 80, 100), others, T);
    expect(res.dy).toBe(-3);
    expect(res.gaps[0].axis).toBe('y');
  });

  it('handles 200 rectangles in under a millisecond (best of five batches, so a busy CPU does not fail it)', () => {
    const others: Rect[] = [];
    for (let i = 0; i < 200; i++)
      others.push(r((i % 20) * 130, Math.floor(i / 20) * 130, 100, 100));
    snapMove(r(333, 333, 100, 100), others, T); // warm up
    let best = Infinity;
    for (let batch = 0; batch < 5; batch++) {
      const t0 = performance.now();
      for (let i = 0; i < 20; i++) snapMove(r(333 + i, 333, 100, 100), others, T);
      best = Math.min(best, (performance.now() - t0) / 20);
    }
    expect(best).toBeLessThan(1);
  });
});

describe('snapResize', () => {
  const start = r(0, 0, 100, 100);

  it('snaps the right edge to a neighbour’s left edge', () => {
    const res = snapResize(start, r(0, 0, 196, 100), 'e', [r(200, 0, 50, 50)], T, {
      keepAspect: false,
      fromCenter: false,
    });
    expect(res.rect.w).toBe(200);
    expect(res.guides.some((g) => g.axis === 'x' && g.at === 200)).toBe(true);
  });

  it('snaps the width to a neighbour’s width and reports it', () => {
    const res = snapResize(start, r(0, 0, 163, 100), 'e', [r(500, 500, 160, 50)], T, {
      keepAspect: false,
      fromCenter: false,
    });
    expect(res.rect.w).toBe(160);
    expect(res.sizeMatch).toContain('w');
  });

  it('moves the left edge for a west handle', () => {
    const res = snapResize(r(100, 0, 100, 100), r(97, 0, 103, 100), 'w', [r(0, 0, 50, 50)], T, {
      keepAspect: false,
      fromCenter: false,
    });
    // left edge 97 is within 6 of 50? no (47 away); within 6 of 100? the other's right is 50. none.
    expect(res.rect).toEqual(r(97, 0, 103, 100));
  });

  it('keeps the aspect and snaps the dominant axis only', () => {
    // dragging se: width grows to 196 (dominant), neighbour's left edge at 200
    const res = snapResize(start, r(0, 0, 196, 196), 'se', [r(200, 400, 50, 50)], T, {
      keepAspect: true,
      fromCenter: false,
    });
    expect(res.rect.w).toBe(200);
    expect(res.rect.h).toBe(200);
  });

  it('snaps from the centre', () => {
    // centre (50,50); resize e from centre: right edge 154 → symmetrical width 108; neighbour edge 150
    const res = snapResize(start, r(-54, 0, 208, 100), 'e', [r(150, 400, 50, 50)], T, {
      keepAspect: false,
      fromCenter: true,
    });
    expect(res.rect.x).toBe(-50);
    expect(res.rect.w).toBe(200);
  });
});
