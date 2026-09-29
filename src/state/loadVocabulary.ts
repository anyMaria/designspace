import type { DbRow, Platform } from '@/platform/types';
import { rowToItemTerm, rowToTerm } from '@/db/rowMapping';
import { useTermStore } from './termStore';

/** Loads the vocabulary (terms) and every item→term link — §4.11 startup. Terms are library-wide
 * (not per-space), so unlike items/placements this doesn't filter by board or deleted_at: a
 * trashed item's terms stay assigned so they're still there if it's restored. */
export async function loadVocabulary(platform: Platform): Promise<void> {
  const [termRows, itemTermRows] = await Promise.all([
    platform.db.select<DbRow>('SELECT * FROM terms ORDER BY facet, sort'),
    platform.db.select<DbRow>('SELECT * FROM item_terms'),
  ]);
  useTermStore.getState().loadAll(termRows.map(rowToTerm), itemTermRows.map(rowToItemTerm));
}
