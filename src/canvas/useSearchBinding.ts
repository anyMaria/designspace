import { useEffect } from 'react';
import type { Engine } from './Engine';
import { useSearchStore } from '@/state/searchStore';
import { useSearchResults } from '@/features/search/useSearchResults';

/** Feeds the search bar's current matches into the canvas as Dim/Hide (§2.8). */
export function useSearchBinding(engine: Engine | null): void {
  const { matches } = useSearchResults();
  const dimHideMode = useSearchStore((s) => s.dimHideMode);

  useEffect(() => {
    if (!engine) return;
    engine.setSearchFilter(matches, dimHideMode);
  }, [engine, matches, dimHideMode]);
}
