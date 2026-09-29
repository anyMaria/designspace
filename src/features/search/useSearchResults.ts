import { useMemo } from 'react';
import type { Platform } from '@/platform/types';
import { useLibraryStore } from '@/state/libraryStore';
import { useTermStore } from '@/state/termStore';
import { useSearchStore, isFilterActive } from '@/state/searchStore';
import { buildSearchIndex, search as runSearch } from '@/lib/search';
import { useMeaningMatches } from './useMeaningMatches';

/** Runs `src/lib/search.ts` against the live stores whenever the filter or the data it reads
 * changes — shared by the search bar (for the "N of M" count and Frame results) and the canvas
 * Dim/Hide binding, so both always agree on exactly which items matched. When "Include visual
 * matches" is on (§4.10), `useMeaningMatches`' CLIP results are unioned in — a semantic match
 * counts exactly like a text/facet one everywhere downstream (Dim/Hide, List, Frame results,
 * "Create board from results"). `platform` is required (not optional) since the meaning search
 * needs it to reach the AI worker; pass the same `platform` every other feature already has. */
export function useSearchResults(platform: Platform): {
  matches: Set<string> | null;
  total: number;
} {
  const items = useLibraryStore((s) => s.items);
  const itemTerms = useTermStore((s) => s.itemTerms);
  const terms = useTermStore((s) => s.terms);
  const filter = useSearchStore((s) => s.filter);
  const meaningMatches = useMeaningMatches(platform);

  const total = useMemo(() => {
    let count = 0;
    for (const item of items.values()) if (!item.deletedAt) count++;
    return count;
  }, [items]);

  const matches = useMemo(() => {
    if (!isFilterActive(filter)) return meaningMatches;
    const index = buildSearchIndex(items.values(), itemTerms, terms);
    const textMatches = runSearch(items.values(), itemTerms, index, filter);
    if (!meaningMatches) return textMatches;
    return new Set([...textMatches, ...meaningMatches]);
  }, [items, itemTerms, terms, filter, meaningMatches]);

  return { matches, total };
}
