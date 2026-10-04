import { Graphics, type Container } from 'pixi.js';

export interface RelatedOutlineEntry {
  /** The card's box in screen px. */
  box: { x: number; y: number; w: number; h: number };
  color: number;
}

export const RELATED_OUTLINE_PX = 2;

/** Patch 2 · A1: while connections are shown, every related card gets a coloured outline, so a
 * relationship is visible even when two cards touch and the line between them has no length.
 * Drawing only: the engine decides which cards and colours, and destroys what this returns. */
export function drawRelatedOutlines(layer: Container, entries: RelatedOutlineEntry[]): Graphics[] {
  return entries.map(({ box, color }) => {
    const g = new Graphics()
      .rect(box.x, box.y, box.w, box.h)
      .stroke({ color, width: RELATED_OUTLINE_PX, alpha: 0.95 });
    layer.addChild(g);
    return g;
  });
}
