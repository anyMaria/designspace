import { create } from 'zustand';

export type OverviewLayout = 'mine' | 'clusters';
export type OverviewNodes = 'thumbnails' | 'dots';

export const OVERVIEW_SPACING_MIN = 0.7;
export const OVERVIEW_SPACING_MAX = 2;

/** The Overview (Patch 1 · G2): a full-window map of the whole space. */
interface OverviewState {
  open: boolean;
  layout: OverviewLayout;
  nodes: OverviewNodes;
  /** Multiplies the Clusters layout's distances (Patch 2 · B2). */
  spacing: number;
  /** A clicked star: its members stay bright, everything else fades. */
  focusHubKey: string | null;
  show: () => void;
  hide: () => void;
  toggle: () => void;
  setLayout: (l: OverviewLayout) => void;
  setNodes: (n: OverviewNodes) => void;
  setSpacing: (s: number) => void;
  setFocusHubKey: (key: string | null) => void;
}

export const useOverviewStore = create<OverviewState>((set, get) => ({
  open: false,
  layout: 'clusters',
  nodes: 'thumbnails',
  spacing: 1,
  focusHubKey: null,
  show: () => set({ open: true }),
  hide: () => set({ open: false, focusHubKey: null }),
  toggle: () => (get().open ? get().hide() : get().show()),
  setLayout: (layout) => set({ layout, focusHubKey: null }),
  setNodes: (nodes) => set({ nodes }),
  setSpacing: (spacing) =>
    set({
      spacing: Math.min(OVERVIEW_SPACING_MAX, Math.max(OVERVIEW_SPACING_MIN, spacing)),
      focusHubKey: null,
    }),
  setFocusHubKey: (focusHubKey) => set({ focusHubKey }),
}));
