import type { DbRow, Platform } from '@/platform';
import { useLibraryStore } from '@/state/libraryStore';
import { logger } from '@/lib/logger';
import { extractPdfDerivatives } from '@/lib/pdfRender';
import { CURRENT_DERIVED_V } from './ingestQueue';
import { fitPlacementsToAspect } from '@/features/import/fitPlacements';
import { queueAiAnalysis } from './aiQueue';

export interface PdfQueueItem {
  itemId: string;
  relPath: string;
}

/** Shared by `PdfIngestQueue.process` (import) and `setPdfCoverPage` ("Set as cover", §2.4) —
 * fetches the original bytes, re-derives thumbnails/metadata for `coverPageOverride` (or the
 * automatic page 1), and persists to cache + DB + the live store. */
async function deriveAndPersist(
  platform: Platform,
  itemId: string,
  relPath: string,
  coverPageOverride?: number,
): Promise<void> {
  const now = new Date().toISOString();
  const url = platform.media.originalUrl(relPath);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${res.url}`);
  const bytes = await res.arrayBuffer();
  const derived = await extractPdfDerivatives(bytes, coverPageOverride);

  await platform.cache.put(`t128/${itemId}`, new Uint8Array(derived.t128));
  await platform.cache.put(`t512/${itemId}`, new Uint8Array(derived.t512));
  queueAiAnalysis(platform, itemId);
  await platform.db.execute(
    `UPDATE items SET width = ?, height = ?, page_count = ?, cover_page = ?, palette = ?,
     color_families = ?, status = 'ok', derived_v = ?, updated_at = ? WHERE id = ?`,
    [
      derived.width,
      derived.height,
      derived.pageCount,
      derived.coverPage,
      JSON.stringify(derived.palette),
      JSON.stringify(derived.colorFamilies),
      CURRENT_DERIVED_V,
      now,
      itemId,
    ],
  );

  await fitPlacementsToAspect(platform, itemId, derived.width / derived.height);

  const current = useLibraryStore.getState().items.get(itemId);
  if (current) {
    useLibraryStore.getState().upsertItem({
      ...current,
      width: derived.width,
      height: derived.height,
      pageCount: derived.pageCount,
      coverPage: derived.coverPage,
      palette: derived.palette,
      colorFamilies: derived.colorFamilies,
      status: 'ok',
      derivedV: CURRENT_DERIVED_V,
      updatedAt: now,
    });
  }
}

/** "Set as cover" (§2.4's cover-page picker, folded into the Focus viewer) — re-renders the
 * chosen page as the item's thumbnail/palette. Not undoable: like Swatches' "Extract palette", a
 * derived-metadata refresh isn't a content edit the owner would expect Ctrl+Z to walk back. */
export async function setPdfCoverPage(
  platform: Platform,
  itemId: string,
  relPath: string,
  page: number,
): Promise<void> {
  await deriveAndPersist(platform, itemId, relPath, page);
}

/** PDF's counterpart to `IngestQueue`/`VideoIngestQueue` (§4.7/§4.9) — same job, processed on the
 * main thread one document at a time, since rasterizing a page to a canvas needs the DOM (pdf.js
 * already parses off-thread internally via its own Worker, but that doesn't cover rendering). A
 * file pdf.js can't parse marks the item `status: 'unsupported'` rather than retrying. */
export class PdfIngestQueue {
  private platform: Platform;
  private queue: PdfQueueItem[] = [];
  private processing = false;

  constructor(platform: Platform) {
    this.platform = platform;
  }

  enqueue(items: PdfQueueItem[]): void {
    this.queue.push(...items);
    void this.pump();
  }

  get pending(): number {
    return this.queue.length;
  }

  private async pump(): Promise<void> {
    if (this.processing) return;
    this.processing = true;
    try {
      let next: PdfQueueItem | undefined;
      while ((next = this.queue.shift())) {
        await this.process(next);
      }
    } finally {
      this.processing = false;
    }
  }

  private async process(item: PdfQueueItem): Promise<void> {
    try {
      await deriveAndPersist(this.platform, item.itemId, item.relPath);
    } catch (err) {
      logger.warn(`PDF ingest failed for ${item.itemId}`, err);
      const now = new Date().toISOString();
      await this.platform.db.execute(
        "UPDATE items SET status = 'unsupported', updated_at = ? WHERE id = ?",
        [now, item.itemId],
      );
      const current = useLibraryStore.getState().items.get(item.itemId);
      if (current) {
        useLibraryStore
          .getState()
          .upsertItem({ ...current, status: 'unsupported', updatedAt: now });
      }
    }
  }

  destroy(): void {
    this.queue = [];
  }
}

let instance: PdfIngestQueue | null = null;

export function getPdfIngestQueue(platform: Platform): PdfIngestQueue {
  instance ??= new PdfIngestQueue(platform);
  return instance;
}

interface PendingRow extends DbRow {
  id: string;
  file_path: string;
}

/** PDF's counterpart to `ingestQueue.ts`'s `resumePendingIngest` — kept separate to avoid a
 * circular import between the two modules; `App.tsx` calls all three at startup. */
export async function resumePendingPdfIngest(platform: Platform): Promise<number> {
  const rows = await platform.db.select<PendingRow>(
    `SELECT id, file_path FROM items
     WHERE kind = 'pdf' AND deleted_at IS NULL AND file_path IS NOT NULL
       AND (status = 'pending' OR derived_v < ?)`,
    [CURRENT_DERIVED_V],
  );
  if (rows.length === 0) return 0;
  getPdfIngestQueue(platform).enqueue(rows.map((r) => ({ itemId: r.id, relPath: r.file_path })));

  return rows.length;
}
