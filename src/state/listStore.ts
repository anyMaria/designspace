import { create } from 'zustand';
import type { GroupBy, SortBy } from '@/features/list/listGrouping';

export type TileSize = 'S' | 'M' | 'L';

export const TILE_SIZE_PX: Record<TileSize, number> = { S: 56, M: 88, L: 132 };

interface ListState {
  groupBy: GroupBy;
  sortBy: SortBy;
  tileSize: TileSize;
  collapsedGroups: Set<string>;
  expanded: boolean;

  setGroupBy: (g: GroupBy) => void;
  setSortBy: (s: SortBy) => void;
  setTileSize: (t: TileSize) => void;
  toggleGroupCollapsed: (key: string) => void;
  setExpanded: (v: boolean) => void;
}

/** List panel UI state (§2.9) — a plain UI-state store, same shape as `uiStore`'s panel/tab
 * state; the underlying item order and grouping are computed live from the library/term stores
 * (`listGrouping.ts`), not stored here. */
export const useListStore = create<ListState>((set) => ({
  groupBy: 'none',
  sortBy: 'newest',
  tileSize: 'M',
  collapsedGroups: new Set(),
  expanded: false,

  setGroupBy: (g) => set({ groupBy: g }),
  setSortBy: (s) => set({ sortBy: s }),
  setTileSize: (t) => set({ tileSize: t }),
  toggleGroupCollapsed: (key) =>
    set((s) => {
      const next = new Set(s.collapsedGroups);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return { collapsedGroups: next };
    }),
  setExpanded: (v) => set({ expanded: v }),
}));
