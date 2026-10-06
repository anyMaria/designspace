import type { ItemKind } from '@/state/types';
import { resizePolicyFor } from './resizeMath';

/** Align, distribute and match size (Patch 3 · C4): pure maths on world rects. */

export interface AlignRect {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export type AlignMode = 'left' | 'hcenter' | 'right' | 'top' | 'vcenter' | 'bottom';
export type Axis = 'x' | 'y';

export interface MoveUpdate {
  id: string;
  x: number;
  y: number;
}

const bounds = (rects: AlignRect[]) => ({
  left: Math.min(...rects.map((r) => r.x)),
  top: Math.min(...rects.map((r) => r.y)),
  right: Math.max(...rects.map((r) => r.x + r.w)),
  bottom: Math.max(...rects.map((r) => r.y + r.h)),
});

/** Lines every rect up with the selection's left, centre, right, top, middle or bottom. Only the
 * rects that actually move are returned. */
export function align(rects: AlignRect[], mode: AlignMode): MoveUpdate[] {
  if (rects.length < 2) return [];
  const b = bounds(rects);
  const updates: MoveUpdate[] = [];
  for (const r of rects) {
    let x = r.x;
    let y = r.y;
    switch (mode) {
      case 'left':
        x = b.left;
        break;
      case 'hcenter':
        x = (b.left + b.right) / 2 - r.w / 2;
        break;
      case 'right':
        x = b.right - r.w;
        break;
      case 'top':
        y = b.top;
        break;
      case 'vcenter':
        y = (b.top + b.bottom) / 2 - r.h / 2;
        break;
      case 'bottom':
        y = b.bottom - r.h;
        break;
    }
    if (x !== r.x || y !== r.y) updates.push({ id: r.id, x, y });
  }
  return updates;
}

/** Spreads three or more rects so the gaps between them are equal. The first and last (by
 * position) stay where they are; the rest keep their order. Sizes may differ. */
export function distribute(rects: AlignRect[], axis: Axis): MoveUpdate[] {
  if (rects.length < 3) return [];
  const pos = (r: AlignRect) => (axis === 'x' ? r.x : r.y);
  const size = (r: AlignRect) => (axis === 'x' ? r.w : r.h);
  const sorted = [...rects].sort((a, b) => pos(a) - pos(b) || a.id.localeCompare(b.id));
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  const span = pos(last) + size(last) - pos(first);
  const total = sorted.reduce((sum, r) => sum + size(r), 0);
  const gap = (span - total) / (sorted.length - 1);
  const updates: MoveUpdate[] = [];
  let cursor = pos(first) + size(first) + gap;
  for (const r of sorted.slice(1, -1)) {
    const next = cursor;
    cursor += size(r) + gap;
    if (next !== pos(r))
      updates.push({ id: r.id, x: axis === 'x' ? next : r.x, y: axis === 'y' ? next : r.y });
  }
  return updates;
}

export interface SizeEntry extends AlignRect {
  kind: ItemKind;
  cropX: number | null;
}

export interface SizeUpdate {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  /** Set when the picture's proportions change, so it is cropped rather than stretched. */
  cropX?: number | null;
  cropY?: number | null;
}

/** Gives every item the width (or height) of the reference (the first one). Pictures change one
 * dimension and crop (Patch 2 · C3); font specimens only scale, so both dimensions follow;
 * palettes size themselves and are left alone. Top-left corners stay. */
export function matchSize(
  entries: SizeEntry[],
  dimension: 'w' | 'h',
  refId?: string,
): SizeUpdate[] {
  if (entries.length < 2) return [];
  const ref = entries.find((e) => e.id === refId) ?? entries[0];
  const target = ref[dimension];
  const updates: SizeUpdate[] = [];
  for (const e of entries) {
    if (e.id === ref.id || e[dimension] === target || target <= 0) continue;
    const policy = resizePolicyFor(e.kind);
    if (policy.handles.length === 0) continue;
    if (policy.alwaysKeepAspect) {
      const scale = target / e[dimension];
      updates.push({ id: e.id, x: e.x, y: e.y, w: e.w * scale, h: e.h * scale });
      continue;
    }
    const next: SizeUpdate = {
      id: e.id,
      x: e.x,
      y: e.y,
      w: dimension === 'w' ? target : e.w,
      h: dimension === 'h' ? target : e.h,
    };
    if (policy.crops && e.cropX === null) {
      next.cropX = 0.5;
      next.cropY = 0.5;
    }
    updates.push(next);
  }
  return updates;
}
