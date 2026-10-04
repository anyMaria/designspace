import type { DbRow, Platform } from '@/platform';
import { useLibraryStore } from '@/state/libraryStore';
import { useSettingsStore } from '@/state/settingsStore';
import { logger } from '@/lib/logger';
import { extractFontDerivatives, SPECIMEN_ASPECT } from '@/lib/fontRender';
import { FONT_DERIVED_V } from './ingestQueue';
import { rowToFontFile } from '@/db/rowMapping';
import { cardFile, fontCardOf, isFontCollection } from '@/lib/fontFamily';
import { fitPlacementsToAspect } from '@/features/import/fitPlacements';
import { queueAiAnalysis } from './aiQueue';

export interface FontQueueItem {
  itemId: string;
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
      const current = useLibraryStore.getState().items.get(item.itemId);
      if (current && isFontCollection(current)) return;
      // The family's files come from the database (a family has one card, several files).
      const rows = await this.platform.db.select<DbRow>(
        'SELECT * FROM font_files WHERE item_id = ? AND deleted_at IS NULL ORDER BY sort',
        [item.itemId],
      );
      const files = rows.map(rowToFontFile);
      const card = fontCardOf({ fontCard: current?.fontCard ?? null }, files);
      const file = cardFile(card, files);
      if (!file) throw new Error('A font family without files');
      const url = this.platform.media.originalUrl(file.filePath);
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${res.url}`);
      const bytes = await res.arrayBuffer();
      const { t128, t512, ...meta } = await extractFontDerivatives(
        bytes,
        item.itemId,
        card.text ?? useSettingsStore.getState().fontPreviewText,
      );

      await this.platform.cache.put(`t128/${item.itemId}`, new Uint8Array(t128));
      await this.platform.cache.put(`t512/${item.itemId}`, new Uint8Array(t512));
      queueAiAnalysis(this.platform, item.itemId);
      await this.platform.db.execute(
        `UPDATE items SET font_meta = ?, status = 'ok', thumb_v = thumb_v + 1, derived_v = ?, updated_at = ? WHERE id = ?`,
        [JSON.stringify(meta), FONT_DERIVED_V, now, item.itemId],
      );

      await fitPlacementsToAspect(this.platform, item.itemId, SPECIMEN_ASPECT);

      const latest = useLibraryStore.getState().items.get(item.itemId);
      if (latest) {
        useLibraryStore.getState().upsertItem({
          ...latest,
          fontMeta: meta,
          thumbV: (latest.thumbV ?? 0) + 1,
          status: 'ok',
          derivedV: FONT_DERIVED_V,
          updatedAt: now,
        });
      }
    } catch (err) {
      logger.warn(`Font ingest failed for ${item.itemId}`, err);
      await this.platform.db.execute(
        "UPDATE items SET status = 'unsupported', updated_at = ? WHERE id = ?",
        [now, item.itemId],
      );
      const failed = useLibraryStore.getState().items.get(item.itemId);
      if (failed) {
        useLibraryStore.getState().upsertItem({ ...failed, status: 'unsupported', updatedAt: now });
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
}

/** Font's counterpart to `ingestQueue.ts`'s `resumePendingIngest` — kept separate to avoid a
 * circular import between the two modules; `App.tsx` calls all four at startup. Collections have
 * no file (`file_path IS NULL`) and are skipped. */
export async function resumePendingFontIngest(platform: Platform): Promise<number> {
  const rows = await platform.db.select<PendingRow>(
    `SELECT id FROM items
     WHERE kind = 'font' AND deleted_at IS NULL AND file_path IS NOT NULL
       AND (status = 'pending' OR derived_v < ?)`,
    [FONT_DERIVED_V],
  );
  if (rows.length === 0) return 0;
  getFontIngestQueue(platform).enqueue(rows.map((r) => ({ itemId: r.id })));

  return rows.length;
}

/** Queues every font family again so each card re-draws its sample line with the current preview
 * text. Each finished item bumps its `thumb_v` (F1), so the cards update one by one. */
export async function rerenderFontSpecimens(platform: Platform): Promise<number> {
  const rows = await platform.db.select<PendingRow>(
    `SELECT id FROM items
     WHERE kind = 'font' AND deleted_at IS NULL AND file_path IS NOT NULL`,
  );
  if (rows.length === 0) return 0;
  getFontIngestQueue(platform).enqueue(rows.map((r) => ({ itemId: r.id })));
  return rows.length;
}
