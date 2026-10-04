import { useMemo } from 'react';
import { useLibraryStore } from '@/state/libraryStore';
import { collectActions, type ActionGroup } from '@/lib/actions';

/** The #actions across the whole library, memoised on the item set. */
export function useActions(): { groups: ActionGroup[]; count: number } {
  const items = useLibraryStore((s) => s.items);
  return useMemo(() => {
    const groups = collectActions(items.values());
    return { groups, count: groups.reduce((n, g) => n + g.entries.length, 0) };
  }, [items]);
}
