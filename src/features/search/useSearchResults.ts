import { useMemo } from 'react';
import { useLibraryStore } from '@/state/libraryStore';
import { useTermStore } from '@/state/termStore';
import { useSearchStore, isFilterActive } from '@/state/searchStore';
import { buildSearchIndex, search as runSearch } from '@/lib/search';

/** Runs `src/lib/search.ts` against the live stores whenever the filter or the data it reads
 * changes — shared by the search bar (for the "N of M" count and Frame results) and the canvas
 * Dim/Hide binding, so both always agree on exactly which items matched. */
export function useSearchResults(): { matches: Set<string> | null; total: number } {
  const items = useLibraryStore((s) => s.items);
  const itemTerms = useTermStore((s) => s.itemTerms);
  const terms = useTermStore((s) => s.terms);
  const filter = useSearchStore((s) => s.filter);

  const total = useMemo(() => {
    let count = 0;
    for (const item of items.values()) if (!item.deletedAt) count++;
    return count;
  }, [items]);

  const matches = useMemo(() => {
    if (!isFilterActive(filter)) return null;
    const index = buildSearchIndex(items.values(), itemTerms, terms);
    return runSearch(items.values(), itemTerms, index, filter);
  }, [items, itemTerms, terms, filter]);

  return { matches, total };
}
