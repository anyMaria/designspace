import type { Rect } from '@/lib/geometry';
import { handleDirection, isCornerHandle, type ResizeHandle } from './resizeMath';

/** A guide line, in world units. `axis: 'x'` is a vertical line at x = `at`, running from y =
 * `from` to y = `to`; `axis: 'y'` is a horizontal line at y = `at`. */
export interface SnapGuide {
  axis: 'x' | 'y';
  at: number;
  from: number;
  to: number;
}

/** Equal gaps: each gap runs along `axis` from `start` to `end`, drawn at `cross` on the other axis. */
export interface GapGuide {
  axis: 'x' | 'y';
  gaps: { start: number; end: number; cross: number }[];
}

export interface SnapResult {
  dx: number;
  dy: number;
  guides: SnapGuide[];
  gaps: GapGuide[];
}

/** Candidates are ranked: edges beat centres and sizes, which beat gaps, when corrections tie. */
const RANK_EDGE = 0;
const RANK_CENTER = 1;
const RANK_GAP = 2;
const EPS = 1e-6;
const MATCH_EPS = 0.01;

interface Candidate {
  /** How far to move along this axis. */
  delta: number;
  rank: number;
  /** Builds the equal-gap markers once the final rect is known (in this axis's own coordinates). */
  gaps?: (finalMoving: Rect) => GapGuide['gaps'][];
}

function best<T extends { delta: number; rank: number }>(candidates: T[]): T | null {
  let winner: T | null = null;
  for (const c of candidates) {
    if (
      winner === null ||
      Math.abs(c.delta) < Math.abs(winner.delta) - EPS ||
      (Math.abs(Math.abs(c.delta) - Math.abs(winner.delta)) <= EPS && c.rank < winner.rank)
    ) {
      winner = c;
    }
  }
  return winner;
}

/** Swaps the axes, so one set of x-axis code serves both directions. */
const flip = (r: Rect): Rect => ({ x: r.y, y: r.x, w: r.h, h: r.w });
const right = (r: Rect): number => r.x + r.w;
const bottom = (r: Rect): number => r.y + r.h;
const overlapsY = (a: Rect, b: Rect): boolean => a.y < bottom(b) && b.y < bottom(a);

/** Candidates for the x axis when a rect moves: edge and centre alignment, plus equal spacing. */
function moveCandidatesX(moving: Rect, others: Rect[], threshold: number): Candidate[] {
  const out: Candidate[] = [];
  const mine = [
    { v: moving.x, edge: true },
    { v: moving.x + moving.w / 2, edge: false },
    { v: right(moving), edge: true },
  ];
  for (const o of others) {
    const theirs = [
      { v: o.x, edge: true },
      { v: o.x + o.w / 2, edge: false },
      { v: right(o), edge: true },
    ];
    for (const m of mine)
      for (const t of theirs) {
        const delta = t.v - m.v;
        if (Math.abs(delta) <= threshold)
          out.push({ delta, rank: m.edge && t.edge ? RANK_EDGE : RANK_CENTER });
      }
  }

  // Equal spacing works along one row: the cards that overlap the moving card vertically.
  const row = others.filter((o) => overlapsY(o, moving)).sort((a, b) => a.x - b.x);
  const centre = moving.x + moving.w / 2;
  const leftSide = row.filter((o) => o.x + o.w / 2 <= centre);
  const rightSide = row.filter((o) => o.x + o.w / 2 > centre);
  const L = leftSide.reduce<Rect | null>(
    (a, o) => (a === null || right(o) > right(a) ? o : a),
    null,
  );
  const R = rightSide.reduce<Rect | null>((a, o) => (a === null || o.x < a.x ? o : a), null);

  const gapsInRow: { a: Rect; b: Rect; size: number }[] = [];
  for (let i = 0; i + 1 < row.length; i++) {
    const size = row[i + 1].x - right(row[i]);
    if (size > MATCH_EPS) gapsInRow.push({ a: row[i], b: row[i + 1], size });
  }
  const crossOf = (...rects: Rect[]): number =>
    rects.reduce((sum, r) => sum + r.y + r.h / 2, 0) / rects.length;

  for (const g of gapsInRow) {
    const pair = { start: right(g.a), end: g.b.x, cross: crossOf(g.a, g.b) };
    if (L) {
      const target = right(L) + g.size;
      const delta = target - moving.x;
      if (Math.abs(delta) <= threshold)
        out.push({
          delta,
          rank: RANK_GAP,
          gaps: (fin) => [[pair, { start: right(L), end: fin.x, cross: crossOf(L, fin) }]],
        });
    }
    if (R) {
      const target = R.x - g.size - moving.w;
      const delta = target - moving.x;
      if (Math.abs(delta) <= threshold)
        out.push({
          delta,
          rank: RANK_GAP,
          gaps: (fin) => [[pair, { start: right(fin), end: R.x, cross: crossOf(R, fin) }]],
        });
    }
  }
  if (L && R && R.x - right(L) >= moving.w) {
    const target = (right(L) + R.x - moving.w) / 2;
    const delta = target - moving.x;
    if (Math.abs(delta) <= threshold)
      out.push({
        delta,
        rank: RANK_GAP,
        gaps: (fin) => [
          [
            { start: right(L), end: fin.x, cross: crossOf(L, fin) },
            { start: right(fin), end: R.x, cross: crossOf(R, fin) },
          ],
        ],
      });
  }
  return out;
}

/** The lines where an anchor of `rect` coincides with an anchor of another card. */
function alignmentGuides(rect: Rect, others: Rect[], axis: 'x' | 'y'): SnapGuide[] {
  const r = axis === 'x' ? rect : flip(rect);
  const guides: SnapGuide[] = [];
  const anchors = [r.x, r.x + r.w / 2, right(r)];
  for (const at of anchors) {
    let from = r.y;
    let to = bottom(r);
    let hit = false;
    for (const other of others) {
      const o = axis === 'x' ? other : flip(other);
      if ([o.x, o.x + o.w / 2, right(o)].some((v) => Math.abs(v - at) <= MATCH_EPS)) {
        hit = true;
        from = Math.min(from, o.y);
        to = Math.max(to, bottom(o));
      }
    }
    if (hit && !guides.some((g) => Math.abs(g.at - at) <= MATCH_EPS))
      guides.push({ axis, at, from, to });
  }
  return guides;
}

/** Moving: snaps the moving bounds' left/centre/right to the others' left/centre/right (same for
 * y), and to equal spacing: the gap to the nearest neighbour on a side equals the gap between two
 * other neighbours in the same row (or column), or the moving rect sits exactly between two
 * neighbours. x and y snap independently; on each axis the smallest correction within `threshold`
 * wins, and a tie prefers edges over centres over gaps. */
export function snapMove(moving: Rect, others: Rect[], threshold: number): SnapResult {
  const cx = best(moveCandidatesX(moving, others, threshold));
  const cy = best(moveCandidatesX(flip(moving), others.map(flip), threshold));
  const dx = cx?.delta ?? 0;
  const dy = cy?.delta ?? 0;
  const final: Rect = { ...moving, x: moving.x + dx, y: moving.y + dy };

  const guides: SnapGuide[] = [];
  const gaps: GapGuide[] = [];
  if (cx) {
    if (cx.gaps) for (const g of cx.gaps(final)) gaps.push({ axis: 'x', gaps: g });
    else guides.push(...alignmentGuides(final, others, 'x'));
  }
  if (cy) {
    if (cy.gaps) for (const g of cy.gaps(flip(final))) gaps.push({ axis: 'y', gaps: g });
    else guides.push(...alignmentGuides(final, others, 'y'));
  }
  return { dx, dy, guides, gaps };
}

/** One axis of a resize. The moving edge `e` (with `dir` −1 = low edge, 1 = high edge) may snap to
 * another card's edge or centre, or make the size equal to another card's size. Returns the
 * target position of that edge, or null. */
function resizeEdgeTarget(
  r: Rect,
  dir: -1 | 1,
  others: Rect[],
  threshold: number,
  fromCenter: boolean,
): { target: number; rank: number } | null {
  const edge = dir < 0 ? r.x : right(r);
  const centre = r.x + r.w / 2;
  const candidates: { delta: number; rank: number; target: number }[] = [];
  for (const o of others) {
    for (const [v, rank] of [
      [o.x, RANK_EDGE],
      [o.x + o.w / 2, RANK_CENTER],
      [right(o), RANK_EDGE],
    ] as const) {
      if (Math.abs(v - edge) <= threshold) candidates.push({ delta: v - edge, rank, target: v });
    }
    // Equal size: the edge goes where the width becomes the other card's width.
    const target = fromCenter ? centre + (dir * o.w) / 2 : dir > 0 ? r.x + o.w : right(r) - o.w;
    if (Math.abs(target - edge) <= threshold && o.w > 0)
      candidates.push({ delta: target - edge, rank: RANK_CENTER, target });
  }
  const winner = best(candidates);
  return winner ? { target: winner.target, rank: winner.rank } : null;
}

function applyEdge(r: Rect, dir: -1 | 1, target: number, fromCenter: boolean): Rect {
  const centre = r.x + r.w / 2;
  if (fromCenter) {
    const half = Math.max(0, dir > 0 ? target - centre : centre - target);
    return { ...r, x: centre - half, w: half * 2 };
  }
  if (dir > 0) return { ...r, w: Math.max(0, target - r.x) };
  return { ...r, x: target, w: Math.max(0, right(r) - target) };
}

/** Resizing: snaps the edges the handle moves to the others' edges and centres, and the width/height
 * to a neighbour's width/height (equal size); keeps the aspect when `keepAspect` (corners snap on
 * the dominant axis only, and the other axis follows the proportions). */
export function snapResize(
  start: Rect,
  proposed: Rect,
  handle: ResizeHandle,
  others: Rect[],
  threshold: number,
  opts: { keepAspect: boolean; fromCenter: boolean },
): { rect: Rect; guides: SnapGuide[]; sizeMatch: ('w' | 'h')[] } {
  const { hx, hy } = handleDirection(handle);
  let rect = { ...proposed };
  const keepAspect = opts.keepAspect && isCornerHandle(handle) && start.h > 0 && start.w > 0;
  const aspect = start.w / start.h;

  const xTarget =
    hx !== 0 ? resizeEdgeTarget(proposed, hx, others, threshold, opts.fromCenter) : null;
  const yTarget =
    hy !== 0
      ? resizeEdgeTarget(flip(proposed), hy, others.map(flip), threshold, opts.fromCenter)
      : null;

  // Which axis leads when the aspect is kept: the one that changed more, relative to its size.
  const xLeads =
    Math.abs(proposed.w - start.w) / start.w >= Math.abs(proposed.h - start.h) / start.h;
  const useX = xTarget !== null && (!keepAspect || xLeads);
  const useY = yTarget !== null && (!keepAspect || !xLeads);

  if (useX && xTarget && hx !== 0) rect = applyEdge(rect, hx, xTarget.target, opts.fromCenter);
  if (useY && yTarget && hy !== 0)
    rect = flip(applyEdge(flip(rect), hy, yTarget.target, opts.fromCenter));

  if (keepAspect && (useX || useY)) {
    // The led axis is final; the other one follows the proportions.
    if (useX) {
      const h = rect.w / aspect;
      rect = flip(
        applyEdge(
          flip(rect),
          hy as -1 | 1,
          hyEdge(rect, hy as -1 | 1, h, opts.fromCenter),
          opts.fromCenter,
        ),
      );
    } else {
      const w = rect.h * aspect;
      rect = applyEdge(
        rect,
        hx as -1 | 1,
        hxEdge(rect, hx as -1 | 1, w, opts.fromCenter),
        opts.fromCenter,
      );
    }
  }

  const guides = [
    ...(hx !== 0 && xTarget ? alignmentGuides(rect, others, 'x') : []),
    ...(hy !== 0 && yTarget ? alignmentGuides(rect, others, 'y') : []),
  ];
  const sizeMatch: ('w' | 'h')[] = [];
  if (hx !== 0 && others.some((o) => Math.abs(o.w - rect.w) <= MATCH_EPS)) sizeMatch.push('w');
  if (hy !== 0 && others.some((o) => Math.abs(o.h - rect.h) <= MATCH_EPS)) sizeMatch.push('h');
  return { rect, guides, sizeMatch };
}

/** Where the moving x edge must be for the rect to be `w` wide (the other edge or the centre stays). */
function hxEdge(r: Rect, dir: -1 | 1, w: number, fromCenter: boolean): number {
  const centre = r.x + r.w / 2;
  if (fromCenter) return centre + (dir * w) / 2;
  return dir > 0 ? r.x + w : right(r) - w;
}

/** Same for the y edge, given the rect in its own coordinates. */
function hyEdge(r: Rect, dir: -1 | 1, h: number, fromCenter: boolean): number {
  const centre = r.y + r.h / 2;
  if (fromCenter) return centre + (dir * h) / 2;
  return dir > 0 ? r.y + h : bottom(r) - h;
}
