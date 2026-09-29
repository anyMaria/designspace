import { PDFDocument } from 'pdf-lib';
import type { Platform } from '@/platform/types';
import type { DropPoint, FlyTo } from '@/features/import/importItems';
import { importFiles } from '@/features/import/importItems';

/** "Split into pages" (§2.4's PDF checklist) — writes each page of the source PDF out as its own
 * single-page PDF file, then imports the batch through the normal import pipeline (dedupe,
 * placement, ingest), same as dropping several files at once. */
export async function splitPdfIntoPages(
  platform: Platform,
  sourceTitle: string,
  bytes: ArrayBuffer,
  dropPoint: DropPoint,
  flyTo?: FlyTo,
): Promise<number> {
  const source = await PDFDocument.load(bytes);
  const pageCount = source.getPageCount();
  const baseName = sourceTitle.replace(/\.[^.]+$/, '') || 'document';

  const files: File[] = [];
  for (let i = 0; i < pageCount; i++) {
    const out = await PDFDocument.create();
    const [copied] = await out.copyPages(source, [i]);
    out.addPage(copied);
    const outBytes = await out.save();
    files.push(
      new File([outBytes as BlobPart], `${baseName} p${i + 1}.pdf`, { type: 'application/pdf' }),
    );
  }

  await importFiles(platform, files, dropPoint, flyTo);
  return pageCount;
}
