import { create } from 'zustand';

interface ImportState {
  active: boolean;
  total: number;
  done: number;
  cancelRequested: boolean;
  begin: (total: number) => void;
  progress: (done: number) => void;
  addToTotal: (n: number) => void;
  finish: () => void;
  cancel: () => void;
}

/** Drives the bottom-right import progress card (§2.3 "Adding 37 of 120… Cancel"). One import
 * runs at a time; a second batch started mid-import just extends the total. */
export const useImportStore = create<ImportState>((set) => ({
  active: false,
  total: 0,
  done: 0,
  cancelRequested: false,

  begin: (total) => set({ active: true, total, done: 0, cancelRequested: false }),
  progress: (done) => set({ done }),
  addToTotal: (n) => set((s) => ({ total: s.total + n })),
  finish: () => set({ active: false, total: 0, done: 0, cancelRequested: false }),
  cancel: () => set({ cancelRequested: true }),
}));
