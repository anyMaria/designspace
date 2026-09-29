import { create } from 'zustand';

interface ShortcutsState {
  isOpen: boolean;
  open: () => void;
  close: () => void;
  toggle: () => void;
}

/** The "?" shortcut list overlay (§2.15) — a plain UI-state store, same shape as `focusStore`. */
export const useShortcutsStore = create<ShortcutsState>((set, get) => ({
  isOpen: false,
  open: () => set({ isOpen: true }),
  close: () => set({ isOpen: false }),
  toggle: () => set({ isOpen: !get().isOpen }),
}));
