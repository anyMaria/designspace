import { create } from 'zustand';

/** Which frame (if any) has its rename dialog open — double-click a frame's title (§2.11). */
interface FrameRenameState {
  frameId: string | null;
  open: (id: string) => void;
  close: () => void;
}

export const useFrameRenameStore = create<FrameRenameState>((set) => ({
  frameId: null,
  open: (id) => set({ frameId: id }),
  close: () => set({ frameId: null }),
}));
