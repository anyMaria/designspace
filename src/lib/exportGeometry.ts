/** Pure layout math for §2.11 Export — kept out of `Engine` (which owns the actual PixiJS
 * rendering) so it can be unit tested without a GPU. */

import { type Rect, unionRects } from './geometry';

export type ExportBackground = 'dots' | 'plum' | 'white';
export type ExportScale = 1 | 2;

/** Padding (world units) around the union of every card's rect when exporting a whole space
 * (a single frame exports exactly its own rect, no padding). */
export const EXPORT_PADDING_WORLD = 48;

/** The world-space rect a whole-space export renders — every card's bounding box, padded.
 * `null` when there's nothing to export. */
export function exportRectForCards(cardRects: Rect[]): Rect | null {
  const bounds = unionRects(cardRects);
  if (!bounds) return null;
  return {
    x: bounds.x - EXPORT_PADDING_WORLD,
    y: bounds.y - EXPORT_PADDING_WORLD,
    w: bounds.w + EXPORT_PADDING_WORLD * 2,
    h: bounds.h + EXPORT_PADDING_WORLD * 2,
  };
}

/** A4/A3 landscape page sizes in points (72pt/in) — jsPDF's own built-in formats, spelled out
 * here so the fitting math below doesn't need jsPDF loaded to be unit tested. */
export const PDF_PAGE_SIZES_PT: Record<'a4' | 'a3', { w: number; h: number }> = {
  a4: { w: 841.89, h: 595.28 },
  a3: { w: 1190.55, h: 841.89 },
};

/** Centers and scales `rect` to fit inside `page`, preserving aspect ratio — where the exported
 * image lands on a PDF page ("the whole board fitted on one A4/A3 landscape page"). */
export function fitRectToPage(
  rect: { w: number; h: number },
  page: { w: number; h: number },
): { x: number; y: number; w: number; h: number } {
  if (rect.w <= 0 || rect.h <= 0) return { x: 0, y: 0, w: 0, h: 0 };
  const scale = Math.min(page.w / rect.w, page.h / rect.h);
  const w = rect.w * scale;
  const h = rect.h * scale;
  return { x: (page.w - w) / 2, y: (page.h - h) / 2, w, h };
}

/** A filesystem-safe default file name for a Save As dialog: the space/frame title, stripped of
 * path-hostile characters, plus the extension. */
export function exportFileName(title: string, extension: 'png' | 'pdf'): string {
  const safe = title.trim().replace(/[\\/:*?"<>|]+/g, '-') || 'export';
  return `${safe}.${extension}`;
}
