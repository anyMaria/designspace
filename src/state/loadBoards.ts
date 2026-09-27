import type { Platform, DbRow } from '@/platform/types';
import { rowToBoard } from '@/db/rowMapping';
import { useBoardStore } from './boardStore';

/** Loads every board (library included, deleted included — the gallery has its own Trash
 * section) so the switcher and gallery never need a fresh query just to render. */
export async function loadBoards(platform: Platform): Promise<void> {
  const rows = await platform.db.select<DbRow>('SELECT * FROM boards ORDER BY created_at');
  useBoardStore.getState().loadAll(rows.map(rowToBoard));
}
