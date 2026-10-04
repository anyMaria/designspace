import { useMemo } from 'react';
import type { TermOption } from '@/lib/termMatch';
import { useTermStore } from '@/state/termStore';

/** Every term of one facet, with how many items use it — the options of a word field's combobox
 * (Patch 2 · D1). */
export function useTermOptions(facet: 'vibe' | 'movement' | 'tag'): TermOption[] {
  const terms = useTermStore((s) => s.terms);
  const itemTerms = useTermStore((s) => s.itemTerms);
  return useMemo(() => {
    const counts = new Map<string, number>();
    for (const ids of itemTerms.values()) {
      for (const id of ids) counts.set(id, (counts.get(id) ?? 0) + 1);
    }
    return [...terms.values()]
      .filter((t) => t.facet === facet)
      .map((t): TermOption => ({ id: t.id, name: t.name, count: counts.get(t.id) ?? 0 }));
  }, [terms, itemTerms, facet]);
}
