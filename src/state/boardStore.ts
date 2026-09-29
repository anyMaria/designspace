import { create } from 'zustand';
import type { Board } from './types';

/** §2.11 Boards — every space (the Library plus every moodboard), and which one the space
 * switcher currently points at. Separate from `libraryStore` (which still only ever holds the
 * Library map's own items/placements — the board canvas itself is a later M4 sub-task); this
 * store is the data behind the switcher and the Boards gallery. */
interface BoardState {
  boards: Map<string, Board>;
  currentBoardId: string | null;

  loadAll: (boards: Board[]) => void;
  upsertBoard: (board: Board) => void;
  removeBoard: (id: string) => void;
  setCurrentBoardId: (id: string) => void;
}

export const useBoardStore = create<BoardState>((set) => ({
  boards: new Map(),
  currentBoardId: null,

  loadAll: (boards) => set({ boards: new Map(boards.map((b) => [b.id, b])) }),

  upsertBoard: (board) =>
    set((s) => {
      const boards = new Map(s.boards);
      boards.set(board.id, board);
      return { boards };
    }),

  removeBoard: (id) =>
    set((s) => {
      const boards = new Map(s.boards);
      boards.delete(id);
      return { boards };
    }),

  setCurrentBoardId: (id) => set({ currentBoardId: id }),
}));
