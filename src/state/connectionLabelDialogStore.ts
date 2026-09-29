import { create } from 'zustand';

interface ConnectionLabelDialogState {
  connectionId: string | null;
  open: (connectionId: string) => void;
  close: () => void;
}

/** "Double-click a line to add a label" (§2.10) — which connection the dialog (rendered once in
 * `Shell.tsx`) is currently editing, if any. */
export const useConnectionLabelDialogStore = create<ConnectionLabelDialogState>((set) => ({
  connectionId: null,
  open: (connectionId) => set({ connectionId }),
  close: () => set({ connectionId: null }),
}));
