import { create } from 'zustand';

export type OverviewLayout = 'mine' | 'clusters';
export type OverviewNodes = 'thumbnails' | 'dots';

/** The Overview (Patch 1 · G2): a full-window map of the whole space. */
interface OverviewState {
  open: boolean;
  layout: OverviewLayout;
  nodes: OverviewNodes;
  show: () => void;
  hide: () => void;
  toggle: () => void;
  setLayout: (l: OverviewLayout) => void;
  setNodes: (n: OverviewNodes) => void;
}

export const useOverviewStore = create<OverviewState>((set, get) => ({
  open: false,
  layout: 'mine',
  nodes: 'thumbnails',
  show: () => set({ open: true }),
  hide: () => set({ open: false }),
  toggle: () => set({ open: !get().open }),
  setLayout: (layout) => set({ layout }),
  setNodes: (nodes) => set({ nodes }),
}));
