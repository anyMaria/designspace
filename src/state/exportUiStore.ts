import { create } from 'zustand';

/** Whether the Export dialog (§2.11) is open — a top-bar button next to the space switcher. */
interface ExportUiState {
  open: boolean;
  setOpen: (open: boolean) => void;
}

export const useExportUiStore = create<ExportUiState>((set) => ({
  open: false,
  setOpen: (open) => set({ open }),
}));
