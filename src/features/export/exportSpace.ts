import type { Platform } from '@/platform/types';
import type { Engine } from '@/canvas/Engine';
import type { ExportBackground, ExportScale } from '@/lib/exportGeometry';
import { PDF_PAGE_SIZES_PT, exportFileName, fitRectToPage } from '@/lib/exportGeometry';
import type { Frame } from '@/state/types';

export interface ExportPngOptions {
  format: 'png';
  scale: ExportScale;
  background: ExportBackground;
  frameId: string | null;
}

export interface ExportPdfOptions {
  format: 'pdf';
  background: ExportBackground;
  pageSize: 'a4' | 'a3';
  frameId: string | null;
  /** Only meaningful (and only shown by the dialog) when `frameId` is null and the space has
   * frames — one page per frame instead of one page for the whole space. */
  onePagePerFrame: boolean;
}

export type ExportOptions = ExportPngOptions | ExportPdfOptions;

/** A PDF page renders at a fixed higher resolution than the PNG default — there's no owner-facing
 * scale choice for PDF (§2.11), but print quality still benefits from more pixels than 1×. */
const PDF_RENDER_SCALE: ExportScale = 2;

function canvasToPngBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('canvas.toBlob failed'));
    }, 'image/png');
  });
}

async function blobToBytes(blob: Blob): Promise<Uint8Array> {
  return new Uint8Array(await blob.arrayBuffer());
}

function frameTitle(frames: Frame[], frameId: string | null, fallback: string): string {
  if (!frameId) return fallback;
  return frames.find((f) => f.id === frameId)?.title ?? fallback;
}

export type ExportResult = 'saved' | 'cancelled' | 'empty';

/** §2.11 Export — renders the current space (or a single frame) through
 * `Engine.renderExportCanvas` and hands the result to the platform's Save As dialog.
 * `'empty'` means there was nothing to export (no cards, or a since-deleted frame); `'cancelled'`
 * means the owner closed the Save As dialog without picking a location — neither is an error. */
export async function exportSpace(
  platform: Platform,
  engine: Engine,
  spaceTitle: string,
  frames: Frame[],
  options: ExportOptions,
): Promise<ExportResult> {
  if (options.format === 'png') {
    const rect = engine.getExportRect(options.frameId);
    if (!rect) return 'empty';
    const canvas = await engine.renderExportCanvas(rect, {
      scale: options.scale,
      background: options.background,
    });
    const bytes = await blobToBytes(await canvasToPngBlob(canvas));
    const title = frameTitle(frames, options.frameId, spaceTitle);
    const saved = await platform.dialogs.saveFile(exportFileName(title, 'png'), bytes);
    return saved ? 'saved' : 'cancelled';
  }

  const { jsPDF } = await import('jspdf');
  const page = PDF_PAGE_SIZES_PT[options.pageSize];
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: [page.w, page.h] });

  const framePages =
    options.onePagePerFrame && !options.frameId && frames.length > 0
      ? frames.map((f): string | null => f.id)
      : [options.frameId];

  let pagesAdded = 0;
  for (const frameId of framePages) {
    const rect = engine.getExportRect(frameId);
    if (!rect) continue;
    const canvas = await engine.renderExportCanvas(rect, {
      scale: PDF_RENDER_SCALE,
      background: options.background,
    });
    const fitted = fitRectToPage(rect, page);
    if (pagesAdded > 0) doc.addPage([page.w, page.h], 'landscape');
    doc.addImage(canvas, 'PNG', fitted.x, fitted.y, fitted.w, fitted.h);
    pagesAdded++;
  }
  if (pagesAdded === 0) return 'empty';

  const bytes = new Uint8Array(doc.output('arraybuffer'));
  const saved = await platform.dialogs.saveFile(exportFileName(spaceTitle, 'pdf'), bytes);
  return saved ? 'saved' : 'cancelled';
}
