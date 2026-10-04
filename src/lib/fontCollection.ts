import { fontCollectionGeometry as G } from '@/design/tokens';

/** Geometry of a type collection (Patch 2 · F5). Pure. */

export function fontCollectionSize(n: number): { w: number; h: number } {
  return { w: G.width, h: G.header + G.row * n + G.padBottom };
}

/** The rect of each member family: one row under the header, in order. */
export function fontCollectionRows(
  n: number,
  card: { x: number; y: number },
): { x: number; y: number; w: number; h: number }[] {
  return Array.from({ length: n }, (_, i) => ({
    x: card.x,
    y: card.y + G.header + i * G.row,
    w: G.width,
    h: G.row,
  }));
}
