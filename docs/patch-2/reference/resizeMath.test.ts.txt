import { describe, expect, it } from 'vitest';
import {
  ALL_HANDLES,
  CORNER_HANDLES,
  cursorForHandle,
  resizeHandleAt,
  resizePolicyFor,
  resizeRect,
  type ResizeHandle,
} from './resizeMath';

const start = { x: 100, y: 100, w: 200, h: 100 }; // aspect 2
const keep = { keepAspect: true, fromCenter: false, minSize: 24 };
const free = { keepAspect: false, fromCenter: false, minSize: 24 };

describe('resizeRect: corners', () => {
  it('se keeps proportions and the nw corner fixed', () => {
    const r = resizeRect(start, 'se', { x: 100, y: 10 }, keep);
    expect(r).toEqual({ x: 100, y: 100, w: 300, h: 150 });
  });

  it('nw keeps the se corner fixed', () => {
    const r = resizeRect(start, 'nw', { x: -50, y: -40 }, keep);
    expect(r.x + r.w).toBeCloseTo(300);
    expect(r.y + r.h).toBeCloseTo(200);
    expect(r.w / r.h).toBeCloseTo(2);
    expect(r.h).toBeCloseTo(140); // y moved more, relative to its size (40/100 > 50/200)
  });

  it('dragging a corner straight inwards shrinks it (the old max-based maths did not)', () => {
    const r = resizeRect(start, 'se', { x: -100, y: 0 }, keep);
    expect(r).toEqual({ x: 100, y: 100, w: 100, h: 50 });
  });

  it('ne and sw anchor the opposite corner', () => {
    const ne = resizeRect(start, 'ne', { x: 100, y: 0 }, keep);
    expect(ne.x).toBe(100);
    expect(ne.y + ne.h).toBe(200);
    expect(ne).toEqual({ x: 100, y: 50, w: 300, h: 150 });
    const sw = resizeRect(start, 'sw', { x: -100, y: 0 }, keep);
    expect(sw).toEqual({ x: 0, y: 100, w: 300, h: 150 });
  });

  it('Shift (keepAspect off) changes each axis freely', () => {
    expect(resizeRect(start, 'se', { x: 100, y: 10 }, free)).toEqual({
      x: 100,
      y: 100,
      w: 300,
      h: 110,
    });
  });

  it('Alt resizes from the centre, both edges move', () => {
    const r = resizeRect(start, 'se', { x: 50, y: 0 }, { ...keep, fromCenter: true });
    expect(r).toEqual({ x: 50, y: 75, w: 300, h: 150 });
    expect(r.x + r.w / 2).toBe(200);
    expect(r.y + r.h / 2).toBe(150);
  });

  it('Alt+Shift: from the centre and free', () => {
    const r = resizeRect(start, 'nw', { x: -10, y: 20 }, { ...free, fromCenter: true });
    expect(r).toEqual({ x: 90, y: 120, w: 220, h: 60 });
  });
});

describe('resizeRect: sides', () => {
  it('e changes the width only', () => {
    expect(resizeRect(start, 'e', { x: 40, y: 999 }, keep)).toEqual({
      x: 100,
      y: 100,
      w: 240,
      h: 100,
    });
  });

  it('w moves the left edge, the right edge stays', () => {
    expect(resizeRect(start, 'w', { x: 40, y: 0 }, free)).toEqual({
      x: 140,
      y: 100,
      w: 160,
      h: 100,
    });
  });

  it('n moves the top edge, the bottom edge stays', () => {
    expect(resizeRect(start, 'n', { x: 999, y: -30 }, free)).toEqual({
      x: 100,
      y: 70,
      w: 200,
      h: 130,
    });
  });

  it('s with Alt grows both top and bottom', () => {
    expect(resizeRect(start, 's', { x: 0, y: 20 }, { ...free, fromCenter: true })).toEqual({
      x: 100,
      y: 80,
      w: 200,
      h: 140,
    });
  });
});

describe('resizeRect: limits', () => {
  it('never goes below the minimum and keeps proportions at the floor', () => {
    const wide = { x: 0, y: 0, w: 300, h: 30 };
    const r = resizeRect(wide, 'se', { x: -1000, y: -1000 }, keep);
    expect(r.h).toBeCloseTo(24);
    expect(r.w).toBeCloseTo(240);
  });

  it('does not flip when dragged past the opposite edge', () => {
    const r = resizeRect(start, 'e', { x: -500, y: 0 }, free);
    expect(r).toEqual({ x: 100, y: 100, w: 24, h: 100 });
    const l = resizeRect(start, 'w', { x: 500, y: 0 }, free);
    expect(l).toEqual({ x: 276, y: 100, w: 24, h: 100 });
  });

  it('never forces a side that already starts below the minimum to grow', () => {
    const thin = { x: 0, y: 0, w: 100, h: 10 };
    expect(resizeRect(thin, 'e', { x: 10, y: 0 }, free)).toEqual({ x: 0, y: 0, w: 110, h: 10 });
    const r = resizeRect(thin, 'se', { x: 0, y: 0 }, keep);
    expect(r).toEqual(thin);
  });

  it('a zero delta returns the start rect for every handle and mode', () => {
    for (const h of ALL_HANDLES) {
      for (const opts of [keep, free, { ...keep, fromCenter: true }]) {
        expect(resizeRect(start, h, { x: 0, y: 0 }, opts)).toEqual(start);
      }
    }
  });
});

describe('resizeHandleAt', () => {
  const b = { x: 0, y: 0, w: 200, h: 100 };
  const all = { tolerance: 6, handles: ALL_HANDLES };

  it('finds the four corners, just inside and just outside', () => {
    expect(resizeHandleAt(b, { x: 0, y: 0 }, all)).toBe('nw');
    expect(resizeHandleAt(b, { x: 205, y: -5 }, all)).toBe('ne');
    expect(resizeHandleAt(b, { x: 196, y: 96 }, all)).toBe('se');
    expect(resizeHandleAt(b, { x: -3, y: 104 }, all)).toBe('sw');
  });

  it('finds the sides anywhere along the edge, on both sides of it', () => {
    expect(resizeHandleAt(b, { x: 100, y: -4 }, all)).toBe('n');
    expect(resizeHandleAt(b, { x: 30, y: 97 }, all)).toBe('s');
    expect(resizeHandleAt(b, { x: 204, y: 50 }, all)).toBe('e');
    expect(resizeHandleAt(b, { x: 3, y: 20 }, all)).toBe('w');
  });

  it('returns null in the middle and far away', () => {
    expect(resizeHandleAt(b, { x: 100, y: 50 }, all)).toBeNull();
    expect(resizeHandleAt(b, { x: 220, y: 50 }, all)).toBeNull();
    expect(resizeHandleAt(b, { x: 100, y: -7 }, all)).toBeNull();
  });

  it('on a small card the zones take at most a quarter inside, so the middle still moves it', () => {
    const small = { x: 0, y: 0, w: 16, h: 16 };
    expect(resizeHandleAt(small, { x: 8, y: 8 }, all)).toBeNull();
    expect(resizeHandleAt(small, { x: 3, y: 8 }, all)).toBe('w');
    expect(resizeHandleAt(small, { x: 5, y: 8 }, all)).toBeNull();
  });

  it('only offers the handles the kind has', () => {
    const corners = { tolerance: 6, handles: CORNER_HANDLES };
    expect(resizeHandleAt(b, { x: 200, y: 50 }, corners)).toBeNull();
    expect(resizeHandleAt(b, { x: 200, y: 100 }, corners)).toBe('se');
    expect(resizeHandleAt(b, { x: 0, y: 0 }, { tolerance: 6, handles: [] })).toBeNull();
  });
});

describe('cursorForHandle', () => {
  it('maps every handle to its CSS resize cursor', () => {
    const expected: Record<ResizeHandle, string> = {
      nw: 'nwse-resize',
      se: 'nwse-resize',
      ne: 'nesw-resize',
      sw: 'nesw-resize',
      e: 'ew-resize',
      w: 'ew-resize',
      n: 'ns-resize',
      s: 'ns-resize',
    };
    for (const h of ALL_HANDLES) expect(cursorForHandle(h)).toBe(expected[h]);
  });
});

describe('resizePolicyFor', () => {
  it('palettes none, fonts corners only and locked, notes free, pictures crop', () => {
    expect(resizePolicyFor('swatch').handles).toEqual([]);
    expect(resizePolicyFor('font')).toMatchObject({
      handles: CORNER_HANDLES,
      alwaysKeepAspect: true,
    });
    expect(resizePolicyFor('note')).toMatchObject({ handles: ALL_HANDLES, crops: false });
    for (const k of ['image', 'video', 'pdf', 'link'] as const)
      expect(resizePolicyFor(k)).toMatchObject({ handles: ALL_HANDLES, crops: true });
  });
});
