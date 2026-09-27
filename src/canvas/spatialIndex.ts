import RBush from 'rbush';
import type { Rect } from './Camera';

export interface IndexedRect {
  id: string;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/** Thin wrapper around rbush for the canvas engine's culling query — §4.6. */
export class SpatialIndex {
  private tree = new RBush<IndexedRect>();

  load(items: { id: string; x: number; y: number; w: number; h: number }[]): void {
    this.tree.clear();
    this.tree.load(
      items.map((i) => ({ id: i.id, minX: i.x, minY: i.y, maxX: i.x + i.w, maxY: i.y + i.h })),
    );
  }

  queryIds(rect: Rect): Set<string> {
    const hits = this.tree.search({
      minX: rect.x,
      minY: rect.y,
      maxX: rect.x + rect.w,
      maxY: rect.y + rect.h,
    });
    return new Set(hits.map((h: IndexedRect) => h.id));
  }

  clear(): void {
    this.tree.clear();
  }
}
