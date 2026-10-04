import { PDFDocument } from 'pdf-lib';

/** Writes the chosen pages of a PDF out as single-page PDF files named "<name> p<n>.pdf" (n is
 * 1-based) — Patch 2 · G1. The files are created without metadata updates so that splitting the same
 * page twice gives identical bytes and the duplicate check recognises it. */
export async function buildSinglePagePdfs(
  bytes: ArrayBuffer,
  baseName: string,
  pageIndices: number[],
): Promise<File[]> {
  const source = await PDFDocument.load(bytes, { updateMetadata: false });
  const base = baseName.replace(/\.[^.]+$/, '') || 'document';
  const files: File[] = [];
  for (const i of pageIndices) {
    const out = await PDFDocument.create({ updateMetadata: false });
    const [copied] = await out.copyPages(source, [i]);
    out.addPage(copied);
    const outBytes = await out.save({ updateFieldAppearances: false });
    files.push(
      new File([outBytes as BlobPart], `${base} p${i + 1}.pdf`, { type: 'application/pdf' }),
    );
  }
  return files;
}
