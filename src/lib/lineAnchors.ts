export interface Point {
  x: number;
  y: number;
}
export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

const centre = (b: Box): Point => ({ x: b.x + b.w / 2, y: b.y + b.h / 2 });

/** Where the ray from the box's centre toward `toward` leaves the box, pushed `gap` px further. */
export function edgePoint(box: Box, toward: Point, gap: number): Point {
  const c = centre(box);
  const dx = toward.x - c.x;
  const dy = toward.y - c.y;
  const len = Math.hypot(dx, dy);
  if (len === 0) return c;
  const sx = dx === 0 ? Infinity : box.w / 2 / Math.abs(dx);
  const sy = dy === 0 ? Infinity : box.h / 2 / Math.abs(dy);
  const s = Math.min(sx, sy);
  const edge = Number.isFinite(s) ? { x: c.x + dx * s, y: c.y + dy * s } : c;
  return { x: edge.x + (dx / len) * gap, y: edge.y + (dy / len) * gap };
}

/** The visible part of the centre-to-centre segment, or null when the boxes are so close or
 * overlapping that the clipped segment would point backwards (draw nothing then). */
export function clipSegmentToBoxes(a: Box, b: Box, gap: number): { from: Point; to: Point } | null {
  const ca = centre(a);
  const cb = centre(b);
  const from = edgePoint(a, cb, gap);
  const to = edgePoint(b, ca, gap);
  const dot = (to.x - from.x) * (cb.x - ca.x) + (to.y - from.y) * (cb.y - ca.y);
  return dot > 0 ? { from, to } : null;
}

export function distanceToSegment(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}
