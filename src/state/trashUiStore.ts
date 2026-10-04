import { create } from 'zustand';

/** Open/close state of the Trash screen (Patch 2 · C5). */
interface TrashUiState {
  open: boolean;
  show: () => void;
  hide: () => void;
}

export const useTrashUiStore = create<TrashUiState>((set) => ({
  open: false,
  show: () => set({ open: true }),
  hide: () => set({ open: false }),
}));
