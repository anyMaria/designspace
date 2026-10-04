import type { Platform } from '@/platform/types';
import { useBoardStore } from '@/state/boardStore';
import { useLibraryStore } from '@/state/libraryStore';
import { loadPlacementsForBoard } from '@/state/loadLibrary';

/** §2.11 "switch space" — used by the space switcher and the Boards gallery's "Open". Moves
 * `boardStore.currentBoardId` (what the switcher/gallery display as "open"), clears the canvas
 * selection (a selected item may not even have a placement on the new space), and swaps
 * `libraryStore.placements` to the new space's own rows, which is what
 * actually changes what the canvas renders (see `libraryStore`'s doc comment). */
export async function switchSpace(platform: Platform, boardId: string): Promise<void> {
  useBoardStore.getState().setCurrentBoardId(boardId);
  useLibraryStore.getState().clearSelection();
  await loadPlacementsForBoard(platform, boardId);
}
