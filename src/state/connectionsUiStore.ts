import { create } from 'zustand';
import type { Criterion } from '@/lib/connections';

export type ConnectionsMode = 'hover' | 'showAll';

const DEFAULT_CRITERIA: Criterion[] = ['vibe', 'tag', 'manual'];
const MAX_ACTIVE_CRITERIA = 3;

interface ConnectionsUiState {
  isOpen: boolean;
  activeCriteria: Criterion[];
  mode: ConnectionsMode;
  minStrength: number;
  constellationsOn: boolean;
  /** Set once a criterion toggle is blocked by the 3-active cap, so the popover can show
   * "Up to 3 at a time. Turn one off first." and clear it itself after a moment. */
  limitHitAt: number | null;
  /** §2.10: "Beyond that, the popover says 'Too many links. Filter first or use Constellations.'"
   * Set by `useConnectionsBinding` whenever Show all's edge count would exceed the 5,000-line
   * cap, so no lines are drawn until the owner filters down or turns on Constellations. */
  showAllOverLimit: boolean;

  open: () => void;
  close: () => void;
  toggle: () => void;
  toggleCriterion: (c: Criterion) => void;
  setMode: (mode: ConnectionsMode) => void;
  setMinStrength: (n: number) => void;
  setConstellationsOn: (v: boolean) => void;
  setShowAllOverLimit: (v: boolean) => void;
}

/** Connections popover state (§2.10) — "remembered per space" in the plan, but there's only one
 * space (the Library map) until Boards land in M4, so a single global store is the correct
 * behavior today, not a simplification that will need undoing later — it just needs to become
 * per-space state once there's more than one space to remember it for. */
export const useConnectionsUiStore = create<ConnectionsUiState>((set) => ({
  isOpen: false,
  activeCriteria: DEFAULT_CRITERIA,
  mode: 'hover',
  minStrength: 1,
  constellationsOn: false,
  limitHitAt: null,
  showAllOverLimit: false,

  open: () => set({ isOpen: true }),
  close: () => set({ isOpen: false }),
  toggle: () => set((s) => ({ isOpen: !s.isOpen })),

  toggleCriterion: (c) =>
    set((s) => {
      if (s.activeCriteria.includes(c)) {
        return { activeCriteria: s.activeCriteria.filter((x) => x !== c) };
      }
      if (s.activeCriteria.length >= MAX_ACTIVE_CRITERIA) {
        return { limitHitAt: Date.now() };
      }
      return { activeCriteria: [...s.activeCriteria, c], limitHitAt: null };
    }),

  setMode: (mode) => set({ mode }),
  setMinStrength: (n) => set({ minStrength: n }),
  setConstellationsOn: (v) => set({ constellationsOn: v }),
  setShowAllOverLimit: (v) => set({ showAllOverLimit: v }),
}));
