import type { DbRow, Platform } from '@/platform/types';
import type { Item } from '@/state/types';
import { rowToItem } from '@/db/rowMapping';
import { logger } from '@/lib/logger';

const AUTO_PURGE_DAYS = 30;

export async function listTrashedItems(platform: Platform): Promise<Item[]> {
  const rows = await platform.db.select<DbRow>(
    'SELECT * FROM items WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC',
  );
  return rows.map(rowToItem);
}

/** Permanently removes items: the original file (to the Recycle Bin on Windows — §5.4), its
 * cached derivatives, and the DB rows. Not a Command — there is no undo once the Recycle Bin is
 * the safety net, matching "Purging sends them to the Recycle Bin" (CLAUDE.md non-negotiables). */
export async function deleteForever(platform: Platform, ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const rows = await platform.db.select<DbRow>(
    `SELECT id, file_path FROM items WHERE id IN (${ids.map(() => '?').join(',')})`,
    ids,
  );
  const relPaths = rows.map((r) => r.file_path as string | null).filter((p): p is string => !!p);

  if (relPaths.length > 0) {
    try {
      await platform.media.purge(relPaths);
    } catch (err) {
      logger.error('Purging original files failed', err);
    }
  }
  try {
    await platform.cache.delete(ids.flatMap((id) => [`t128/${id}`, `t512/${id}`]));
  } catch (err) {
    logger.error('Purging cached derivatives failed', err);
  }

  await platform.db.batch([
    {
      sql: `DELETE FROM placements WHERE item_id IN (${ids.map(() => '?').join(',')})`,
      params: ids,
    },
    { sql: `DELETE FROM items WHERE id IN (${ids.map(() => '?').join(',')})`, params: ids },
  ]);
}

/** Auto-purge after 30 days (§5.4). Call once at startup, after the library is loaded. */
export async function purgeExpiredTrash(platform: Platform): Promise<void> {
  const cutoff = new Date(Date.now() - AUTO_PURGE_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const rows = await platform.db.select<DbRow>(
    'SELECT id FROM items WHERE deleted_at IS NOT NULL AND deleted_at < ?',
    [cutoff],
  );
  if (rows.length === 0) return;
  await deleteForever(
    platform,
    rows.map((r) => r.id as string),
  );
}
