import { PDFDocument } from 'pdf-lib';
import type { Platform } from '@/platform/types';
import { buildSinglePagePdfs } from '@/features/focus/splitPdfIntoPages';
import { requestPdfPages } from '@/state/pdfPickerStore';
import { logger } from '@/lib/logger';
import {
  importFiles,
  importPaths,
  type BatchLayoutOptions,
  type DropPoint,
  type FlyTo,
} from './importItems';

/** Adding PDFs with a page choice (Patch 2 · G3): a PDF of several pages asks which pages to add,
 * as one PDF or as separate pages that keep their proportions. Folder… and onboarding do not call
 * this (they add whole files without asking). */

const isPdf = (name: string): boolean => /\.pdf$/i.test(name);

async function pageCountOf(bytes: ArrayBuffer): Promise<number> {
  try {
    const doc = await PDFDocument.load(bytes, { updateMetadata: false });
    return doc.getPageCount();
  } catch (err) {
    logger.warn('Could not count the pages of a PDF', err);
    return 1;
  }
}

interface PageBatch {
  files: File[];
  layout: BatchLayoutOptions;
}

/** Asks about one PDF. `whole`: add it as it is; `pages`: a batch of one-page files; null: skip. */
async function askAbout(name: string, bytes: ArrayBuffer): Promise<'whole' | 'skip' | PageBatch> {
  if ((await pageCountOf(bytes)) <= 1) return 'whole';
  const choice = await requestPdfPages({ name, bytes, mode: 'import' });
  if (!choice) return 'skip';
  if (choice.kind === 'whole') return 'whole';
  const files = await buildSinglePagePdfs(bytes, name, choice.pageIndices);
  return { files, layout: { aspects: choice.aspects, anchor: 'centre' } };
}

/** Drop, paste and the browser's Files…: File objects. */
export async function importFilesWithPdfChoice(
  platform: Platform,
  files: File[],
  dropPoint: DropPoint,
  flyTo?: FlyTo,
): Promise<void> {
  const keep: File[] = [];
  const batches: PageBatch[] = [];
  for (const file of files) {
    if (!isPdf(file.name)) {
      keep.push(file);
      continue;
    }
    const answer = await askAbout(file.name, await file.arrayBuffer());
    if (answer === 'whole') keep.push(file);
    else if (answer !== 'skip') batches.push(answer);
  }
  if (keep.length > 0) await importFiles(platform, keep, dropPoint, flyTo);
  for (const b of batches) await importFiles(platform, b.files, dropPoint, flyTo, b.layout);
}

/** The desktop app's Files…: paths. A PDF answered with pages (or cancelled) leaves the list. */
export async function importPathsWithPdfChoice(
  platform: Platform,
  paths: string[],
  dropPoint: DropPoint,
  flyTo?: FlyTo,
): Promise<void> {
  const keep: string[] = [];
  const batches: PageBatch[] = [];
  for (const path of paths) {
    if (!isPdf(path)) {
      keep.push(path);
      continue;
    }
    try {
      const name = path.split(/[/\\]/).pop() ?? path;
      const answer = await askAbout(name, await platform.media.readPdf(path));
      if (answer === 'whole') keep.push(path);
      else if (answer !== 'skip') batches.push(answer);
    } catch (err) {
      logger.warn('Could not read a PDF for the page picker', err);
      keep.push(path); // add it whole rather than lose it
    }
  }
  if (keep.length > 0) await importPaths(platform, keep, dropPoint, flyTo);
  for (const b of batches) await importFiles(platform, b.files, dropPoint, flyTo, b.layout);
}
