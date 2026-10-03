import { describe, expect, it } from 'vitest';
import { clipSegmentToBoxes, distanceToSegment, edgePoint } from './lineAnchors';

const box = (x: number, y: number, w = 100, h = 100) => ({ x, y, w, h });

describe('clipSegmentToBoxes', () => {
  it('side by side: right edge to left edge, with the gap', () => {
    const r = clipSegmentToBoxes(box(0, 0), box(300, 0), 6);
    expect(r?.from).toEqual({ x: 106, y: 50 });
    expect(r?.to).toEqual({ x: 294, y: 50 });
  });

  it('above and below: bottom edge to top edge', () => {
    const r = clipSegmentToBoxes(box(0, 0), box(0, 300), 6);
    expect(r?.from).toEqual({ x: 50, y: 106 });
    expect(r?.to).toEqual({ x: 50, y: 294 });
  });

  it('diagonal: leaves through the side the line crosses first', () => {
    const r = clipSegmentToBoxes(box(0, 0), box(400, 200), 0);
    expect(r?.from.x).toBeCloseTo(100);
    expect(r?.from.y).toBeCloseTo(75);
  });

  it('returns null when the boxes overlap so much the line would point backwards', () => {
    expect(clipSegmentToBoxes(box(0, 0), box(40, 0), 6)).toBeNull();
  });
});

describe('edgePoint', () => {
  it('a zero-size box (a hub) gives its centre plus the gap', () => {
    const p = edgePoint({ x: 10, y: 10, w: 0, h: 0 }, { x: 110, y: 10 }, 6);
    expect(p.x).toBeCloseTo(16);
    expect(p.y).toBeCloseTo(10);
  });
});

describe('distanceToSegment', () => {
  it('measures to the nearest point of the segment, clamped at the ends', () => {
    expect(distanceToSegment({ x: 5, y: 3 }, { x: 0, y: 0 }, { x: 10, y: 0 })).toBe(3);
    expect(distanceToSegment({ x: 13, y: 4 }, { x: 0, y: 0 }, { x: 10, y: 0 })).toBe(5);
  });
});
