import type { Platform } from '@/platform/types';
import type { DbRow } from '@/platform/types';
import { rowToItem, rowToPlacement } from '@/db/rowMapping';
import { useLibraryStore } from './libraryStore';

/** Loads non-deleted items and the current space's placements into the store — §4.11 startup
 * ("load non-deleted items... the current space's placements"). */
export async function loadLibraryItems(platform: Platform, libraryBoardId: string): Promise<void> {
  const [itemRows, placementRows] = await Promise.all([
    platform.db.select<DbRow>('SELECT * FROM items WHERE deleted_at IS NULL'),
    platform.db.select<DbRow>('SELECT * FROM placements WHERE board_id = ?', [libraryBoardId]),
  ]);
  useLibraryStore.getState().loadAll(itemRows.map(rowToItem), placementRows.map(rowToPlacement));
}
