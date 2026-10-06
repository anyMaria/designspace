import { create } from 'zustand';
import type { Filter } from '@/lib/search';
import type { Facet } from '@/state/types';
import type { ColorFamily } from '@/lib/color';

export type DimHideMode = 'dim' | 'hide';

interface SearchState {
  isOpen: boolean;
  filter: Filter;
  dimHideMode: DimHideMode;

  open: () => void;
  /** Esc (§2.8): clears the text first if there is any, otherwise closes the bar. Filters stay
   * active in the space until explicitly cleared — only the bar's visibility changes. */
  closeOrClearText: () => void;
  setText: (text: string) => void;
  toggleTerm: (facet: Facet, termId: string, exclude: boolean) => void;
  toggleKind: (kind: NonNullable<Filter['kinds']>[number]) => void;
  toggleColor: (color: ColorFamily) => void;
  toggleArtist: (artist: string) => void;
  toggleFavorite: () => void;
  toggleInbox: () => void;
  setDateRange: (range: Filter['added'] | undefined) => void;
  clearFilter: () => void;
  setDimHideMode: (mode: DimHideMode) => void;
}

function toggleInArray<T>(arr: T[] | undefined, value: T): T[] | undefined {
  const next = arr ? [...arr] : [];
  const i = next.indexOf(value);
  if (i >= 0) next.splice(i, 1);
  else next.push(value);
  return next.length > 0 ? next : undefined;
}

/** Search bar + filter state (§2.8). A plain UI-state store, mirroring `focusStore`/
 * `triageStore`: the bar, the canvas Dim/Hide binding and the List panel (M2-8) all read the same
 * `filter`, and `<Shell>`/`useEngineBindings` run it through `src/lib/search.ts` to get the
 * matching id set. */
export const useSearchStore = create<SearchState>((set, get) => ({
  isOpen: false,
  filter: {},
  dimHideMode: 'dim',

  open: () => set({ isOpen: true }),
  closeOrClearText: () => {
    const { filter } = get();
    if (filter.text) set({ filter: { ...filter, text: undefined } });
    else set({ isOpen: false });
  },
  setText: (text) => set((s) => ({ filter: { ...s.filter, text: text || undefined } })),

  toggleTerm: (facet, termId, exclude) =>
    set((s) => {
      const include = { ...s.filter.include };
      const excludeMap = { ...s.filter.exclude };
      if (exclude) {
        include[facet] = include[facet]?.filter((id) => id !== termId);
        if (include[facet]?.length === 0) delete include[facet];
        excludeMap[facet] = toggleInArray(excludeMap[facet], termId);
        if (!excludeMap[facet]) delete excludeMap[facet];
      } else {
        excludeMap[facet] = excludeMap[facet]?.filter((id) => id !== termId);
        if (excludeMap[facet]?.length === 0) delete excludeMap[facet];
        include[facet] = toggleInArray(include[facet], termId);
        if (!include[facet]) delete include[facet];
      }
      return {
        filter: {
          ...s.filter,
          include: Object.keys(include).length > 0 ? include : undefined,
          exclude: Object.keys(excludeMap).length > 0 ? excludeMap : undefined,
        },
      };
    }),

  toggleKind: (kind) =>
    set((s) => ({ filter: { ...s.filter, kinds: toggleInArray(s.filter.kinds, kind) } })),
  toggleColor: (color) =>
    set((s) => ({ filter: { ...s.filter, colors: toggleInArray(s.filter.colors, color) } })),
  toggleArtist: (artist) =>
    set((s) => ({ filter: { ...s.filter, artists: toggleInArray(s.filter.artists, artist) } })),
  toggleFavorite: () =>
    set((s) => ({ filter: { ...s.filter, favorite: !s.filter.favorite || undefined } })),
  toggleInbox: () => set((s) => ({ filter: { ...s.filter, inbox: !s.filter.inbox || undefined } })),
  setDateRange: (range) => set((s) => ({ filter: { ...s.filter, added: range } })),
  clearFilter: () => set({ filter: {} }),
  setDimHideMode: (mode) => set({ dimHideMode: mode }),
}));

export function isFilterActive(filter: Filter): boolean {
  return !!(
    filter.text ||
    filter.kinds?.length ||
    filter.colors?.length ||
    filter.artists?.length ||
    filter.favorite ||
    filter.inbox ||
    filter.added ||
    (filter.include && Object.keys(filter.include).length > 0) ||
    (filter.exclude && Object.keys(filter.exclude).length > 0)
  );
}
