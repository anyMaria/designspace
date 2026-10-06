import type { Rect } from '@/lib/geometry';
import { snap } from '@/design/tokens';
import { snapMove, snapResize } from './snapping';
import type { ResizeHandle } from './resizeMath';
import type { SnapOverlay } from './snapGuides';

interface Positioned {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

const intersects = (a: Rect, b: Rect): boolean =>
  a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

/** The cards a drag can snap to (Patch 3 · P5): those visible on screen that are not being
 * moved, at most `max`, nearest to `near` first. */
export function collectSnapTargets(
  cards: Iterable<Positioned>,
  moving: ReadonlySet<string>,
  view: Rect,
  near: Rect,
  max: number = snap.maxTargets,
): Rect[] {
  const cx = near.x + near.w / 2;
  const cy = near.y + near.h / 2;
  const visible: { rect: Rect; distance: number }[] = [];
  for (const c of cards) {
    if (moving.has(c.id)) continue;
    const rect = { x: c.x, y: c.y, w: c.w, h: c.h };
    if (!intersects(rect, view)) continue;
    visible.push({ rect, distance: Math.hypot(c.x + c.w / 2 - cx, c.y + c.h / 2 - cy) });
  }
  visible.sort((a, b) => a.distance - b.distance);
  return visible.slice(0, max).map((v) => v.rect);
}

/** One drag's snapping state: the targets collected at the start and the screen threshold turned
 * into world units. The engine only routes pointer events to it. */
export class SnapSession {
  private readonly targets: Rect[];
  private readonly thresholdWorld: number;

  constructor(targets: Rect[], thresholdWorld: number) {
    this.targets = targets;
    this.thresholdWorld = thresholdWorld;
  }

  /** `bounds`: the whole selection at the press; `delta`: the pointer's world movement since. */
  move(
    bounds: Rect,
    delta: { x: number; y: number },
  ): { dx: number; dy: number; overlay: SnapOverlay } {
    const proposed = { ...bounds, x: bounds.x + delta.x, y: bounds.y + delta.y };
    const res = snapMove(proposed, this.targets, this.thresholdWorld);
    return {
      dx: delta.x + res.dx,
      dy: delta.y + res.dy,
      overlay: { guides: res.guides, gaps: res.gaps },
    };
  }

  resize(
    start: Rect,
    proposed: Rect,
    handle: ResizeHandle,
    opts: { keepAspect: boolean; fromCenter: boolean },
  ): { rect: Rect; overlay: SnapOverlay } {
    const res = snapResize(start, proposed, handle, this.targets, this.thresholdWorld, opts);
    return {
      rect: res.rect,
      overlay: {
        guides: res.guides,
        gaps: [],
        equalSides: res.sizeMatch.length > 0 ? { rect: res.rect, sides: res.sizeMatch } : undefined,
      },
    };
  }
}
