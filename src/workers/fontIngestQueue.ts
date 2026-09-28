import type { DbRow, Platform } from '@/platform';
import { useLibraryStore } from '@/state/libraryStore';
import { logger } from '@/lib/logger';
import { extractFontDerivatives } from '@/lib/fontRender';
import { CURRENT_DERIVED_V } from './ingestQueue';

export interface FontQueueItem {
  itemId: string;
  relPath: string;
}

/** Font's counterpart to `IngestQueue`/`VideoIngestQueue`/`PdfIngestQueue` (§4.7/§4.9) — parsing
 * (`fontkit.create`) needs no DOM and could run in a Worker, but rendering the specimen card does
 * (`FontFace` + canvas `fillText`, see `lib/fontRender.ts`), so this processes one font at a time
 * on the main thread, same shape as the others. A file fontkit/`FontFace` can't parse marks the
 * item `status: 'unsupported'` rather than retrying. */
export class FontIngestQueue {
  private platform: Platform;
  private queue: FontQueueItem[] = [];
  private processing = false;

  constructor(platform: Platform) {
    this.platform = platform;
  }

  enqueue(items: FontQueueItem[]): void {
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
      let next: FontQueueItem | undefined;
      while ((next = this.queue.shift())) {
        await this.process(next);
      }
    } finally {
      this.processing = false;
    }
  }

  private async process(item: FontQueueItem): Promise<void> {
    const now = new Date().toISOString();
    try {
      const url = this.platform.media.originalUrl(item.relPath);
      const res = await fetch(url);
      const bytes = await res.arrayBuffer();
      const { t128, t512, ...meta } = await extractFontDerivatives(bytes, item.itemId);

      await this.platform.cache.put(`t128/${item.itemId}`, new Uint8Array(t128));
      await this.platform.cache.put(`t512/${item.itemId}`, new Uint8Array(t512));
      await this.platform.db.execute(
        `UPDATE items SET font_meta = ?, status = 'ok', derived_v = ?, updated_at = ? WHERE id = ?`,
        [JSON.stringify(meta), CURRENT_DERIVED_V, now, item.itemId],
      );

      const current = useLibraryStore.getState().items.get(item.itemId);
      if (current) {
        useLibraryStore.getState().upsertItem({
          ...current,
          fontMeta: meta,
          status: 'ok',
          derivedV: CURRENT_DERIVED_V,
          updatedAt: now,
        });
      }
    } catch (err) {
      logger.warn(`Font ingest failed for ${item.itemId}`, err);
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

let instance: FontIngestQueue | null = null;

export function getFontIngestQueue(platform: Platform): FontIngestQueue {
  instance ??= new FontIngestQueue(platform);
  return instance;
}

interface PendingRow extends DbRow {
  id: string;
  file_path: string;
}

/** Font's counterpart to `ingestQueue.ts`'s `resumePendingIngest` — kept separate to avoid a
 * circular import between the two modules; `App.tsx` calls all four at startup. */
export async function resumePendingFontIngest(platform: Platform): Promise<void> {
  const rows = await platform.db.select<PendingRow>(
    `SELECT id, file_path FROM items
     WHERE kind = 'font' AND deleted_at IS NULL AND file_path IS NOT NULL
       AND (status = 'pending' OR derived_v < ?)`,
    [CURRENT_DERIVED_V],
  );
  if (rows.length === 0) return;
  getFontIngestQueue(platform).enqueue(rows.map((r) => ({ itemId: r.id, relPath: r.file_path })));
}
