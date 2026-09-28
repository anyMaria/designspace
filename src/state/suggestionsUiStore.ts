import { create } from 'zustand';

/** Whether the suggestions tray (§2.11) is collapsed — a plain UI-state store, not persisted per
 * board (unlike dismissals, which are — see `createDismissSuggestionCommand`). */
interface SuggestionsUiState {
  collapsed: boolean;
  toggle: () => void;
}

export const useSuggestionsUiStore = create<SuggestionsUiState>((set) => ({
  collapsed: false,
  toggle: () => set((s) => ({ collapsed: !s.collapsed })),
}));
