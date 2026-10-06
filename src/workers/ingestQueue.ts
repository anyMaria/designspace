import type { DbRow, Platform } from '@/platform';
import { useLibraryStore } from '@/state/libraryStore';
import { logger } from '@/lib/logger';
import type { IngestRequest, IngestResponse } from './ingest.worker';
import { fitPlacementsToAspect } from '@/features/import/fitPlacements';

/** Minimal Worker surface this module needs — lets tests inject a fake. */
export interface WorkerLike {
  postMessage(message: unknown, transfer?: Transferable[]): void;
  onmessage: ((event: MessageEvent) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  terminate(): void;
}

export interface QueueItem {
  itemId: string;
  relPath: string;
  mime: string;
}

const POOL_SIZE = 2;
/** Bump to re-queue every item (§4.7 "resumable").
 * Patch 1: re-derive everything once. Thumbnails never loaded on Windows before the media:// fix
 * (A1) and placements need their real shape (A4). */
export const CURRENT_DERIVED_V = 2;
/** Font cards have their own version so redrawing them never re-makes every picture. 3 = the
 * family card of Patch 2 · F4 (existing font cards are redrawn once). */
export const FONT_DERIVED_V = 3;

function defaultWorkerFactory(): WorkerLike {
  return new Worker(new URL('./ingest.worker.ts', import.meta.url), { type: 'module' });
}

/** Runs image ingest (thumbnails, palette, pHash) in a small worker pool — §4.7. Workers can't
 * reach Tauri's `invoke` directly (no `window` in a worker), so they only do the CPU work; this
 * class fetches the original bytes and persists the worker's result on the main thread. */
export class IngestQueue {
  private platform: Platform;
  private workers: WorkerLike[];
  private busy = new Set<WorkerLike>();
  private queue: QueueItem[] = [];
  private nextReqId = 0;
  private paused = false;

  constructor(
    platform: Platform,
    workerFactory: () => WorkerLike = defaultWorkerFactory,
    poolSize = POOL_SIZE,
  ) {
    this.platform = platform;
    this.workers = Array.from({ length: poolSize }, () => {
      const worker = workerFactory();
      worker.onmessage = (event: MessageEvent<IngestResponse>) => {
        this.handleResult(worker, event.data);
      };
      return worker;
    });
  }

  enqueue(items: QueueItem[]): void {
    this.queue.push(...items);
    this.pump();
  }

  pause(): void {
    this.paused = true;
  }

  resume(): void {
    this.paused = false;
    this.pump();
  }

  get pending(): number {
    return this.queue.length;
  }

  private pump(): void {
    if (this.paused) return;
    for (const worker of this.workers) {
      if (this.busy.has(worker)) continue;
      const next = this.queue.shift();
      if (!next) return;
      this.busy.add(worker);
      void this.dispatch(worker, next);
    }
  }

  private async dispatch(worker: WorkerLike, item: QueueItem): Promise<void> {
    try {
      const url = this.platform.media.originalUrl(item.relPath);
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${res.url}`);
      const bytes = await res.arrayBuffer();
      const req: IngestRequest = {
        id: `req-${++this.nextReqId}`,
        itemId: item.itemId,
        bytes,
        mime: item.mime,
      };
      worker.postMessage(req, [bytes]);
    } catch (err) {
      logger.error(`Ingest: couldn't read the original for ${item.itemId}`, err);
      this.busy.delete(worker);
      // Mark it failed so it doesn't stay "pending" forever (A2).
      this.persist({ id: 'read-failed', itemId: item.itemId, ok: false, error: String(err) })
        .catch((e: unknown) => logger.error('Ingest: failed to persist a read failure', e))
        .finally(() => this.pump());
    }
  }

  private handleResult(worker: WorkerLike, result: IngestResponse): void {
    this.busy.delete(worker);
    this.persist(result)
      .catch((err: unknown) => logger.error('Ingest: failed to persist a result', err))
      .finally(() => this.pump());
  }

  async persist(result: IngestResponse): Promise<void> {
    const now = new Date().toISOString();

    if (!result.ok) {
      await this.platform.db.execute(
        "UPDATE items SET status = 'error', updated_at = ? WHERE id = ?",
        [now, result.itemId],
      );
      logger.warn(`Ingest failed for ${result.itemId}: ${result.error}`);
      return;
    }

    await this.platform.cache.put(`t128/${result.itemId}`, new Uint8Array(result.t128));
    await this.platform.cache.put(`t512/${result.itemId}`, new Uint8Array(result.t512));
    await this.platform.db.execute(
      `UPDATE items SET width = ?, height = ?, palette = ?, color_families = ?, phash = ?,
       status = 'ok', thumb_v = thumb_v + 1, derived_v = ?, updated_at = ? WHERE id = ?`,
      [
        result.width,
        result.height,
        JSON.stringify(result.palette),
        JSON.stringify(result.colorFamilies),
        result.phash,
        CURRENT_DERIVED_V,
        now,
        result.itemId,
      ],
    );

    await fitPlacementsToAspect(this.platform, result.itemId, result.width / result.height);

    const item = useLibraryStore.getState().items.get(result.itemId);
    if (item) {
      useLibraryStore.getState().upsertItem({
        ...item,
        width: result.width,
        height: result.height,
        palette: result.palette,
        colorFamilies: result.colorFamilies,
        phash: result.phash,
        thumbV: (item.thumbV ?? 0) + 1,
        status: 'ok',
        derivedV: CURRENT_DERIVED_V,
        updatedAt: now,
      });
    }
  }

  destroy(): void {
    for (const worker of this.workers) worker.terminate();
  }
}

let instance: IngestQueue | null = null;

export function getIngestQueue(platform: Platform): IngestQueue {
  instance ??= new IngestQueue(platform);
  return instance;
}

interface PendingRow extends DbRow {
  id: string;
  file_path: string;
  mime: string;
}

/** Re-queues items left mid-ingest by a previous run, or whose derivatives predate an algorithm
 * change — §4.7 "Resumable". Call once at startup after the library is open. */
export async function resumePendingIngest(platform: Platform): Promise<number> {
  // Links with a cover go through the image worker too (their cover is an ingested image).
  const rows = await platform.db.select<PendingRow>(
    `SELECT id, COALESCE(file_path, cover_path) AS file_path, mime FROM items
     WHERE deleted_at IS NULL
       AND ((kind = 'image' AND file_path IS NOT NULL) OR (kind = 'link' AND cover_path IS NOT NULL))
       AND (status = 'pending' OR derived_v < ?)`,
    [CURRENT_DERIVED_V],
  );
  if (rows.length === 0) return 0;
  getIngestQueue(platform).enqueue(
    rows.map((r) => ({ itemId: r.id, relPath: r.file_path, mime: r.mime })),
  );
  return rows.length;
}
