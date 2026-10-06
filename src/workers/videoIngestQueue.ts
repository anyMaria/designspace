import type { DbRow, Platform } from '@/platform';
import { useLibraryStore } from '@/state/libraryStore';
import { logger } from '@/lib/logger';
import { extractVideoDerivatives } from '@/lib/videoFrame';
import { CURRENT_DERIVED_V } from './ingestQueue';
import { fitPlacementsToAspect } from '@/features/import/fitPlacements';

export interface VideoQueueItem {
  itemId: string;
  relPath: string;
  mime: string;
}

/** Video's counterpart to `IngestQueue` (§4.7/§4.9) — same job (fetch the original, derive
 * thumbnails/metadata, persist to cache + DB + the live store), but processed on the main thread
 * one at a time rather than in a Worker pool, since `extractVideoDerivatives` needs a real
 * `<video>` element (see its own doc comment for why). A codec/container `<video>` can't decode
 * marks the item `status: 'unsupported'` — the plan's fallback tile — rather than retrying, so a
 * bad file never becomes an ingest loop. */
export class VideoIngestQueue {
  private platform: Platform;
  private queue: VideoQueueItem[] = [];
  private processing = false;

  constructor(platform: Platform) {
    this.platform = platform;
  }

  enqueue(items: VideoQueueItem[]): void {
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
      let next: VideoQueueItem | undefined;
      while ((next = this.queue.shift())) {
        await this.process(next);
      }
    } finally {
      this.processing = false;
    }
  }

  private async process(item: VideoQueueItem): Promise<void> {
    const now = new Date().toISOString();
    try {
      const url = this.platform.media.originalUrl(item.relPath);
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${res.url}`);
      const bytes = await res.arrayBuffer();
      const derived = await extractVideoDerivatives(bytes, item.mime);

      await this.platform.cache.put(`t128/${item.itemId}`, new Uint8Array(derived.t128));
      await this.platform.cache.put(`t512/${item.itemId}`, new Uint8Array(derived.t512));
      await this.platform.db.execute(
        `UPDATE items SET width = ?, height = ?, duration_ms = ?, poster_ms = ?, palette = ?,
         color_families = ?, status = 'ok', thumb_v = thumb_v + 1, derived_v = ?, updated_at = ? WHERE id = ?`,
        [
          derived.width,
          derived.height,
          derived.durationMs,
          derived.posterMs,
          JSON.stringify(derived.palette),
          JSON.stringify(derived.colorFamilies),
          CURRENT_DERIVED_V,
          now,
          item.itemId,
        ],
      );

      await fitPlacementsToAspect(this.platform, item.itemId, derived.width / derived.height);

      const current = useLibraryStore.getState().items.get(item.itemId);
      if (current) {
        useLibraryStore.getState().upsertItem({
          ...current,
          thumbV: (current.thumbV ?? 0) + 1,
          width: derived.width,
          height: derived.height,
          durationMs: derived.durationMs,
          posterMs: derived.posterMs,
          palette: derived.palette,
          colorFamilies: derived.colorFamilies,
          status: 'ok',
          derivedV: CURRENT_DERIVED_V,
          updatedAt: now,
        });
      }
    } catch (err) {
      logger.warn(`Video ingest failed for ${item.itemId}`, err);
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

let instance: VideoIngestQueue | null = null;

export function getVideoIngestQueue(platform: Platform): VideoIngestQueue {
  instance ??= new VideoIngestQueue(platform);
  return instance;
}

interface PendingRow extends DbRow {
  id: string;
  file_path: string;
  mime: string;
}

/** Video's counterpart to `ingestQueue.ts`'s `resumePendingIngest` — kept separate (rather than
 * one shared function) to avoid a circular import between the two modules; `App.tsx` calls both
 * at startup. */
export async function resumePendingVideoIngest(platform: Platform): Promise<number> {
  const rows = await platform.db.select<PendingRow>(
    `SELECT id, file_path, mime FROM items
     WHERE kind = 'video' AND deleted_at IS NULL AND file_path IS NOT NULL
       AND (status = 'pending' OR derived_v < ?)`,
    [CURRENT_DERIVED_V],
  );
  if (rows.length === 0) return 0;
  getVideoIngestQueue(platform).enqueue(
    rows.map((r) => ({ itemId: r.id, relPath: r.file_path, mime: r.mime })),
  );

  return rows.length;
}
