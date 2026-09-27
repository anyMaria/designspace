import { create } from 'zustand';
import type { Facet, ItemTerm, Term } from './types';

/**
 * The vocabulary (terms) and which items carry which terms — §2.5, §4.3 `state/vocab`. Kept
 * separate from `libraryStore` since terms are library-wide, not per-space, and the vocabulary
 * manager (Settings → Vocabularies) and Details panel both need to read/write them independently
 * of item selection.
 */
interface TermState {
  terms: Map<string, Term>; // by id
  itemTerms: Map<string, Set<string>>; // itemId -> Set<termId>

  loadAll: (terms: Term[], itemTerms: ItemTerm[]) => void;
  upsertTerm: (term: Term) => void;
  upsertTerms: (terms: Term[]) => void;
  removeTerms: (ids: string[]) => void;
  addItemTerm: (itemId: string, termId: string) => void;
  removeItemTerm: (itemId: string, termId: string) => void;
  /** Termids for one item, restricted to one facet — the current Type/Vibe/Movement/Tags chips. */
  itemTermIdsForFacet: (itemId: string, facet: Facet) => string[];
}

export const useTermStore = create<TermState>((set, get) => ({
  terms: new Map(),
  itemTerms: new Map(),

  loadAll: (terms, itemTerms) => {
    const byItem = new Map<string, Set<string>>();
    for (const it of itemTerms) {
      const set = byItem.get(it.itemId) ?? new Set<string>();
      set.add(it.termId);
      byItem.set(it.itemId, set);
    }
    set({ terms: new Map(terms.map((t) => [t.id, t])), itemTerms: byItem });
  },

  upsertTerm: (term) =>
    set((s) => {
      const terms = new Map(s.terms);
      terms.set(term.id, term);
      return { terms };
    }),

  upsertTerms: (newTerms) =>
    set((s) => {
      const terms = new Map(s.terms);
      for (const t of newTerms) terms.set(t.id, t);
      return { terms };
    }),

  removeTerms: (ids) =>
    set((s) => {
      const terms = new Map(s.terms);
      for (const id of ids) terms.delete(id);
      const itemTerms = new Map<string, Set<string>>();
      for (const [itemId, termIds] of s.itemTerms) {
        const next = new Set(termIds);
        for (const id of ids) next.delete(id);
        itemTerms.set(itemId, next);
      }
      return { terms, itemTerms };
    }),

  addItemTerm: (itemId, termId) =>
    set((s) => {
      const itemTerms = new Map(s.itemTerms);
      const set = new Set(itemTerms.get(itemId));
      set.add(termId);
      itemTerms.set(itemId, set);
      return { itemTerms };
    }),

  removeItemTerm: (itemId, termId) =>
    set((s) => {
      const itemTerms = new Map(s.itemTerms);
      const set = new Set(itemTerms.get(itemId));
      set.delete(termId);
      itemTerms.set(itemId, set);
      return { itemTerms };
    }),

  itemTermIdsForFacet: (itemId, facet) => {
    const { terms, itemTerms } = get();
    const ids = itemTerms.get(itemId);
    if (!ids) return [];
    return [...ids].filter((id) => terms.get(id)?.facet === facet);
  },
}));
