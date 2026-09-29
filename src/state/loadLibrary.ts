import type { Platform } from '@/platform/types';
import type { DbRow } from '@/platform/types';
import { rowToItem, rowToPlacement, rowToFrame } from '@/db/rowMapping';
import { useLibraryStore } from './libraryStore';
import { useFrameStore } from './frameStore';

/** Loads non-deleted items and the current space's placements into the store — §4.11 startup
 * ("load non-deleted items... the current space's placements"). */
export async function loadLibraryItems(platform: Platform, libraryBoardId: string): Promise<void> {
  const [itemRows, placementRows] = await Promise.all([
    platform.db.select<DbRow>('SELECT * FROM items WHERE deleted_at IS NULL'),
    platform.db.select<DbRow>('SELECT * FROM placements WHERE board_id = ?', [libraryBoardId]),
  ]);
  useLibraryStore.getState().loadAll(itemRows.map(rowToItem), placementRows.map(rowToPlacement));
}

/** §2.11 switching spaces: swaps just the placements (the item catalog stays library-wide) so
 * the canvas — which only draws a card per `placements` entry — shows the newly-opened board or
 * the Library map. Called by the space switcher and the Boards gallery's "Open". */
export async function loadPlacementsForBoard(platform: Platform, boardId: string): Promise<void> {
  const rows = await platform.db.select<DbRow>('SELECT * FROM placements WHERE board_id = ?', [
    boardId,
  ]);
  useLibraryStore.getState().setPlacements(rows.map(rowToPlacement));
}

/** Loads the current space's frames (§2.11) — called alongside `loadPlacementsForBoard`
 * everywhere that's called (startup and every "switch space"), so the two stay in sync. */
export async function loadFramesForBoard(platform: Platform, boardId: string): Promise<void> {
  const rows = await platform.db.select<DbRow>('SELECT * FROM frames WHERE board_id = ?', [
    boardId,
  ]);
  useFrameStore.getState().setFrames(rows.map(rowToFrame));
}
