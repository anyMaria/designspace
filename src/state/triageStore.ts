import { create } from 'zustand';

interface TriageState {
  isOpen: boolean;
  order: string[];
  index: number;
  newestFirst: boolean;
  open: (order: string[]) => void;
  close: () => void;
  next: () => void;
  prev: () => void;
  toggleOrder: () => void;
}

/** Triage overlay state (§2.7) — a snapshot of the Inbox's item ids at the moment it opened (so
 * the header's "N of M" denominator stays fixed while working through it), plus a cursor into it.
 * The snapshot itself is built by the caller (Shell's Inbox chip), which already has the live
 * Inbox set and the sort order to hand in. */
export const useTriageStore = create<TriageState>((set, get) => ({
  isOpen: false,
  order: [],
  index: 0,
  newestFirst: false,

  open: (order) => set({ isOpen: true, order, index: 0 }),
  close: () => set({ isOpen: false, order: [], index: 0 }),
  next: () => set({ index: Math.min(get().index + 1, get().order.length) }),
  prev: () => set({ index: Math.max(get().index - 1, 0) }),
  // Reversing the (already oldest/newest sorted) snapshot flips the order without needing to
  // re-touch the library store — and keeps pointing at the same item, at its mirrored position.
  toggleOrder: () => {
    const { order, index, newestFirst } = get();
    set({
      order: [...order].reverse(),
      index: order.length > 0 ? order.length - 1 - index : 0,
      newestFirst: !newestFirst,
    });
  },
}));
