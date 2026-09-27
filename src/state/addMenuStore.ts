import { create } from 'zustand';

interface AddMenuState {
  open: boolean;
  setOpen: (open: boolean) => void;
  toggle: () => void;
}

/** Whether the dock's + Add popover is open — lifted out of `<AddMenu>` so the Library map's
 * empty-state card (§2.14, "press + Add") can open it too. */
export const useAddMenuStore = create<AddMenuState>((set) => ({
  open: false,
  setOpen: (open) => set({ open }),
  toggle: () => set((s) => ({ open: !s.open })),
}));
