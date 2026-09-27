import { create } from 'zustand';

/** Open/close state for the space switcher popover and the Boards gallery overlay (§2.11). */
interface BoardUiState {
  switcherOpen: boolean;
  galleryOpen: boolean;
  toggleSwitcher: () => void;
  closeSwitcher: () => void;
  openGallery: () => void;
  closeGallery: () => void;
}

export const useBoardUiStore = create<BoardUiState>((set) => ({
  switcherOpen: false,
  galleryOpen: false,
  toggleSwitcher: () => set((s) => ({ switcherOpen: !s.switcherOpen })),
  closeSwitcher: () => set({ switcherOpen: false }),
  openGallery: () => set({ galleryOpen: true, switcherOpen: false }),
  closeGallery: () => set({ galleryOpen: false }),
}));
