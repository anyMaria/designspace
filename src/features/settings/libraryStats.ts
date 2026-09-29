import type { DbRow, Platform } from '@/platform/types';
import type { ItemKind } from '@/state/types';

export interface LibraryStats {
  itemCounts: Partial<Record<ItemKind, number>>;
  totalItems: number;
  totalBytes: number;
}

/** Item counts per kind and total disk usage (§2.14's Settings → About) — the sum of
 * `items.file_size` for non-deleted items, i.e. the originals only (not thumbnails, cache or
 * backups, which live outside what an owner thinks of as "their library"). */
export async function loadLibraryStats(platform: Platform): Promise<LibraryStats> {
  const rows = await platform.db.select<DbRow>(
    `SELECT kind, COUNT(*) as count, SUM(COALESCE(file_size, 0)) as bytes
     FROM items WHERE deleted_at IS NULL GROUP BY kind`,
  );
  const itemCounts: Partial<Record<ItemKind, number>> = {};
  let totalItems = 0;
  let totalBytes = 0;
  for (const row of rows) {
    const kind = row.kind as ItemKind;
    const count = Number(row.count ?? 0);
    itemCounts[kind] = count;
    totalItems += count;
    totalBytes += Number(row.bytes ?? 0);
  }
  return { itemCounts, totalItems, totalBytes };
}
