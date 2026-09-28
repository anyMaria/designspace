import { create } from 'zustand';
import type { Item, Placement } from './types';

/**
 * The item catalog (library-wide, every space shares it) plus the *current* space's placements
 * — §4.3 `state/library` + `state/space` combined. `items` never changes when switching spaces;
 * `placements` is swapped out wholesale by `setPlacements` (§2.11, `boardUiStore`'s "switch
 * space" effect) — the canvas engine (`useEngineBindings`) only ever draws a card for an item
 * that has an entry in `placements`, so pointing `placements` at a board's own rows is enough to
 * make the canvas "show that board" with no Engine changes needed. Commands mutate this store
 * optimistically, then persist through `platform.db.batch`; the canvas engine subscribes to it
 * via `useLibraryStore.subscribe` rather than React re-renders.
 */
interface LibraryState {
  libraryBoardId: string | null;
  items: Map<string, Item>;
  placements: Map<string, Placement>; // keyed by itemId, scoped to the current space
  selection: Set<string>;

  setLibraryBoardId: (id: string) => void;
  loadAll: (items: Item[], placements: Placement[]) => void;
  upsertItem: (item: Item) => void;
  upsertItems: (items: Item[]) => void;
  removeItems: (ids: string[]) => void;
  upsertPlacement: (placement: Placement) => void;
  removePlacements: (itemIds: string[]) => void;
  setPlacements: (placements: Placement[]) => void;
  setSelection: (ids: string[]) => void;
  toggleSelection: (id: string, additive: boolean) => void;
  clearSelection: () => void;
}

export const useLibraryStore = create<LibraryState>((set) => ({
  libraryBoardId: null,
  items: new Map(),
  placements: new Map(),
  selection: new Set(),

  setLibraryBoardId: (id) => set({ libraryBoardId: id }),

  loadAll: (items, placements) =>
    set({
      items: new Map(items.map((i) => [i.id, i])),
      placements: new Map(placements.map((p) => [p.itemId, p])),
    }),

  upsertItem: (item) =>
    set((s) => {
      const items = new Map(s.items);
      items.set(item.id, item);
      return { items };
    }),

  upsertItems: (newItems) =>
    set((s) => {
      const items = new Map(s.items);
      for (const item of newItems) items.set(item.id, item);
      return { items };
    }),

  removeItems: (ids) =>
    set((s) => {
      const items = new Map(s.items);
      const placements = new Map(s.placements);
      const selection = new Set(s.selection);
      for (const id of ids) {
        items.delete(id);
        placements.delete(id);
        selection.delete(id);
      }
      return { items, placements, selection };
    }),

  upsertPlacement: (placement) =>
    set((s) => {
      const placements = new Map(s.placements);
      placements.set(placement.itemId, placement);
      return { placements };
    }),

  removePlacements: (itemIds) =>
    set((s) => {
      const placements = new Map(s.placements);
      for (const id of itemIds) placements.delete(id);
      return { placements };
    }),

  /** Replaces the whole placements map — §2.11 switching the current space (Library vs. a
   * board). Unlike `loadAll`, `items` stays put: items are library-wide, boards are just a
   * different `placements` view over the same catalog (§4.3). */
  setPlacements: (placements) => set({ placements: new Map(placements.map((p) => [p.itemId, p])) }),

  setSelection: (ids) => set({ selection: new Set(ids) }),

  toggleSelection: (id, additive) =>
    set((s) => {
      const selection = additive ? new Set(s.selection) : new Set<string>();
      if (selection.has(id)) selection.delete(id);
      else selection.add(id);
      return { selection };
    }),

  clearSelection: () => set({ selection: new Set() }),
}));
