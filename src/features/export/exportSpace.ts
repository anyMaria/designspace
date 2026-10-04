import type { Platform } from '@/platform/types';
import type { Engine } from '@/canvas/Engine';
import type { ExportBackground, ExportScale } from '@/lib/exportGeometry';
import { PDF_PAGE_SIZES_PT, exportFileName, fitRectToPage } from '@/lib/exportGeometry';

export interface ExportPngOptions {
  format: 'png';
  scale: ExportScale;
  background: ExportBackground;
  area: ExportArea;
  /** The ids to export when `area` is 'selection'. */
  ids: string[];
}

export interface ExportPdfOptions {
  format: 'pdf';
  background: ExportBackground;
  pageSize: 'a4' | 'a3';
  area: ExportArea;
  ids: string[];
}

export type ExportArea = 'all' | 'selection';

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

/** The file title: the space name, plus " (selection)" when only the selection is exported. */
function exportTitle(spaceTitle: string, area: ExportArea): string {
  return area === 'selection' ? `${spaceTitle} (selection)` : spaceTitle;
}

export type ExportResult = 'saved' | 'cancelled' | 'empty';

/** §2.11 Export — renders the current space (or just the selected items) through
 * `Engine.renderExportCanvas` and hands the result to the platform's Save As dialog.
 * `'empty'` means there was nothing to export (no cards, or a selection that no longer exists); `'cancelled'`
 * means the owner closed the Save As dialog without picking a location — neither is an error. */
export async function exportSpace(
  platform: Platform,
  engine: Engine,
  spaceTitle: string,
  options: ExportOptions,
): Promise<ExportResult> {
  if (options.format === 'png') {
    const rect = engine.getExportRect(options.area === 'selection' ? options.ids : null);
    if (!rect) return 'empty';
    const canvas = await engine.renderExportCanvas(rect, {
      scale: options.scale,
      background: options.background,
    });
    const bytes = await blobToBytes(await canvasToPngBlob(canvas));
    const saved = await platform.dialogs.saveFile(
      exportFileName(exportTitle(spaceTitle, options.area), 'png'),
      bytes,
    );
    return saved ? 'saved' : 'cancelled';
  }

  const { jsPDF } = await import('jspdf');
  const page = PDF_PAGE_SIZES_PT[options.pageSize];
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: [page.w, page.h] });

  // One page: the whole space, or the selection.
  const rect = engine.getExportRect(options.area === 'selection' ? options.ids : null);
  if (!rect) return 'empty';
  const canvas = await engine.renderExportCanvas(rect, {
    scale: PDF_RENDER_SCALE,
    background: options.background,
  });
  const fitted = fitRectToPage(rect, page);
  doc.addImage(canvas, 'PNG', fitted.x, fitted.y, fitted.w, fitted.h);

  const bytes = new Uint8Array(doc.output('arraybuffer'));
  const saved = await platform.dialogs.saveFile(
    exportFileName(exportTitle(spaceTitle, options.area), 'pdf'),
    bytes,
  );
  return saved ? 'saved' : 'cancelled';
}
