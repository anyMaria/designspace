import { create } from 'zustand';

/** Which item's description panel is open (Patch 1 · E2/E3). Only one at a time. */
interface DescriptionState {
  itemId: string | null;
  open: (id: string) => void;
  close: () => void;
  /** Click on the bubble: open it, or close it when it is already this item's. */
  toggle: (id: string) => void;
}

export const useDescriptionStore = create<DescriptionState>((set, get) => ({
  itemId: null,
  open: (id) => set({ itemId: id }),
  close: () => set({ itemId: null }),
  toggle: (id) => set({ itemId: get().itemId === id ? null : id }),
}));
