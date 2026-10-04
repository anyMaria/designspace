import { create } from 'zustand';

/** Which picture is in "Adjust crop" mode (Patch 2 · C3); null when none. */
interface CropUiState {
  itemId: string | null;
  start: (id: string) => void;
  stop: () => void;
}

export const useCropUiStore = create<CropUiState>((set) => ({
  itemId: null,
  start: (itemId) => set({ itemId }),
  stop: () => set({ itemId: null }),
}));
