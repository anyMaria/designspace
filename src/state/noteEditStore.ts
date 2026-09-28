import { create } from 'zustand';

/** Which note (if any) is being edited in place — §2.11. Only one note editor is ever open at
 * once, mirroring Focus view's own single-`itemId` shape. */
interface NoteEditState {
  itemId: string | null;
  open: (id: string) => void;
  close: () => void;
}

export const useNoteEditStore = create<NoteEditState>((set) => ({
  itemId: null,
  open: (id) => set({ itemId: id }),
  close: () => set({ itemId: null }),
}));
