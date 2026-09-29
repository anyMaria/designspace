import { create } from 'zustand';

interface FocusState {
  itemId: string | null;
  open: (id: string) => void;
  close: () => void;
}

/** Which item Focus view (§2.12) is showing, if any. A plain UI-state store (not library data),
 * so the canvas engine, keyboard shortcuts and <FocusView> can all reach it without prop drilling. */
export const useFocusStore = create<FocusState>((set) => ({
  itemId: null,
  open: (id) => set({ itemId: id }),
  close: () => set({ itemId: null }),
}));
