// The `legacy` build, not `pdfjs-dist`'s default export — the default build calls
// `Map.prototype.getOrInsertComputed`, a JS engine built-in that hasn't actually shipped in any
// browser yet (verified empirically: `typeof Map.prototype.getOrInsertComputed` is `undefined` in
// this sandbox's Chromium 141 *and* in Node 22), which throws the moment pdf.js touches optional
// content config. The `legacy` build ships its own polyfill for exactly that gap — see
// docs/DECISIONS.md.
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import { fitLongSide } from './geometry';
import { extractPalette, weightedColorFamilies, type PaletteEntry } from './color';

/** Cover-page rendering + palette extraction for PDF items (§2.4, §4.9). Mirrors
 * `lib/videoFrame.ts`'s shape closely: main-thread (pdf.js already runs its own parsing Worker
 * internally, but rasterizing a page to a canvas needs the DOM), one document open at a time, two
 * thumbnail sizes plus a square color sample so PDFs are searchable/connectable by color exactly
 * like images and videos. */

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/legacy/build/pdf.worker.mjs',
  import.meta.url,
).toString();

const T128 = 128;
const T512 = 512;
const PALETTE_SAMPLE = 64;
const WEBP_QUALITY = 0.82;

export interface PdfDerivatives {
  pageCount: number;
  coverPage: number;
  width: number;
  height: number;
  t128: ArrayBuffer;
  t512: ArrayBuffer;
  palette: PaletteEntry[];
  colorFamilies: string[];
}

export interface OpenPdfHandle {
  doc: pdfjsLib.PDFDocumentProxy;
  /** Tears down the parsing worker — call once the caller is done with `doc`. */
  destroy: () => Promise<void>;
}

/** Opens a PDF document for interactive viewing (the Focus viewer's page-by-page nav, §2.4) —
 * unlike `extractPdfDerivatives`, the caller owns the document's lifetime and must call
 * `destroy()` once done with it. */
export async function openPdfDocument(bytes: ArrayBuffer): Promise<OpenPdfHandle> {
  const loadingTask = pdfjsLib.getDocument({ data: bytes });
  const doc = await loadingTask.promise;
  return { doc, destroy: () => loadingTask.destroy() };
}

/** Renders one page of an already-open document to a canvas, fit to `longSide` — exported for the
 * Focus viewer, which renders whichever page is currently shown rather than just the cover. */
export async function renderPdfPage(
  doc: pdfjsLib.PDFDocumentProxy,
  pageNumber: number,
  longSide: number,
): Promise<HTMLCanvasElement> {
  const page = await doc.getPage(pageNumber);
  try {
    return await renderPageToCanvas(page, longSide);
  } finally {
    page.cleanup();
  }
}

async function renderPageToCanvas(
  page: pdfjsLib.PDFPageProxy,
  longSide: number,
): Promise<HTMLCanvasElement> {
  const baseViewport = page.getViewport({ scale: 1 });
  const { w } = fitLongSide(baseViewport.width, baseViewport.height, longSide);
  const scale = w / baseViewport.width;
  const viewport = page.getViewport({ scale });

  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(viewport.width));
  canvas.height = Math.max(1, Math.round(viewport.height));
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context unavailable');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvasContext: ctx, viewport, canvas }).promise;
  return canvas;
}

function canvasToWebp(canvas: HTMLCanvasElement): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error('canvas.toBlob returned null'));
          return;
        }
        void blob.arrayBuffer().then(resolve, reject);
      },
      'image/webp',
      WEBP_QUALITY,
    );
  });
}

/** Square, aspect-squashed downsample of an already-rendered page canvas for uniform color
 * sampling — matches `ingest.worker.ts`'s `sampleRgba` / `videoFrame.ts`'s `drawSquareSample`. */
function squareSample(source: HTMLCanvasElement, size: number): Uint8ClampedArray {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context unavailable');
  ctx.drawImage(source, 0, 0, size, size);
  return ctx.getImageData(0, 0, size, size).data;
}

/** Renders `coverPage` (1-based, defaults to page 1) of a PDF into two thumbnail sizes and a
 * palette, alongside the document's total page count. Rejects for anything pdf.js can't parse,
 * which callers should map to `status: 'unsupported'` rather than retrying. */
export async function extractPdfDerivatives(
  bytes: ArrayBuffer,
  coverPageOverride?: number,
): Promise<PdfDerivatives> {
  // `getDocument()` returns a loading task, not the document itself — only the task can fully
  // tear down the parsing worker (`PDFDocumentProxy` only exposes per-page `cleanup()`).
  const loadingTask = pdfjsLib.getDocument({ data: bytes });
  const doc = await loadingTask.promise;
  try {
    const pageCount = doc.numPages;
    const coverPage = Math.max(1, Math.min(coverPageOverride ?? 1, pageCount));
    const page = await doc.getPage(coverPage);
    try {
      const frame512 = await renderPageToCanvas(page, T512);
      const frame128 = await renderPageToCanvas(page, T128);
      const [t128, t512] = await Promise.all([canvasToWebp(frame128), canvasToWebp(frame512)]);

      const rgba = squareSample(frame512, PALETTE_SAMPLE);
      const palette = extractPalette(rgba, 5);
      const colorFamilies = weightedColorFamilies(palette);

      const viewport = page.getViewport({ scale: 1 });
      return {
        pageCount,
        coverPage,
        width: Math.round(viewport.width),
        height: Math.round(viewport.height),
        t128,
        t512,
        palette,
        colorFamilies,
      };
    } finally {
      page.cleanup();
    }
  } finally {
    await loadingTask.destroy();
  }
}
