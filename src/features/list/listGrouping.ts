import type { Item, Term, Facet } from '@/state/types';
import { en } from '@/i18n/en';

export type GroupBy = 'none' | Facet | 'color' | 'kind' | 'artist' | 'month';
export type SortBy = 'newest' | 'oldest' | 'title';

export interface Group {
  key: string;
  label: string;
  dotColor: string | null;
  itemIds: string[];
}

const NONE_LABEL: Record<GroupBy, string> = {
  none: '',
  type: 'No type',
  vibe: 'No vibe',
  movement: 'No movement',
  tag: 'No tags',
  color: 'No color',
  kind: 'No kind',
  artist: 'No artist',
  month: 'No date',
};

const FACET_DOT: Partial<Record<GroupBy, string>> = {
  type: 'var(--criterion-type)',
  vibe: 'var(--criterion-vibe)',
  movement: 'var(--criterion-movement)',
  tag: 'var(--criterion-tags)',
  color: 'var(--criterion-color)',
};

function monthLabel(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
}

/** Buckets item ids into groups per §2.9 — an item with several values for the grouping
 * criterion (e.g. two Vibes) appears in each of its groups; items with none land in one
 * "No <criterion>" group, sorted last; empty groups never appear at all. Within each group,
 * `sortItems` still decides the item order. */
export function groupItems(
  items: Item[],
  groupBy: GroupBy,
  itemTerms: Map<string, Set<string>>,
  terms: Map<string, Term>,
): Group[] {
  if (groupBy === 'none') {
    return [{ key: 'all', label: '', dotColor: null, itemIds: items.map((i) => i.id) }];
  }

  const buckets = new Map<string, { label: string; dotColor: string | null; itemIds: string[] }>();
  const none: string[] = [];

  function add(key: string, label: string, dotColor: string | null, itemId: string): void {
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = { label, dotColor, itemIds: [] };
      buckets.set(key, bucket);
    }
    bucket.itemIds.push(itemId);
  }

  for (const item of items) {
    if (groupBy === 'type' || groupBy === 'vibe' || groupBy === 'movement' || groupBy === 'tag') {
      const ids = [...(itemTerms.get(item.id) ?? [])]
        .map((id) => terms.get(id))
        .filter((t): t is Term => t?.facet === groupBy);
      if (ids.length === 0) none.push(item.id);
      else for (const t of ids) add(t.id, t.name, FACET_DOT[groupBy]!, item.id);
    } else if (groupBy === 'color') {
      const families = item.colorFamilies ?? [];
      if (families.length === 0) none.push(item.id);
      else for (const family of families) add(family, family, FACET_DOT.color!, item.id);
    } else if (groupBy === 'kind') {
      add(item.kind, en.kind[item.kind], null, item.id);
    } else if (groupBy === 'artist') {
      if (!item.artist) none.push(item.id);
      else add(item.artist, item.artist, null, item.id);
    } else if (groupBy === 'month') {
      const key = item.createdAt.slice(0, 7); // YYYY-MM
      add(key, monthLabel(item.createdAt), null, item.id);
    }
  }

  const groups = [...buckets.entries()]
    .sort((a, b) => a[1].label.localeCompare(b[1].label))
    .map(([key, bucket]) => ({ key, ...bucket }));

  if (none.length > 0) {
    groups.push({ key: '__none__', label: NONE_LABEL[groupBy], dotColor: null, itemIds: none });
  }
  return groups;
}

export function sortItems(ids: string[], sortBy: SortBy, items: Map<string, Item>): string[] {
  const sorted = [...ids];
  sorted.sort((aId, bId) => {
    const a = items.get(aId);
    const b = items.get(bId);
    if (!a || !b) return 0;
    if (sortBy === 'newest') return b.createdAt.localeCompare(a.createdAt);
    if (sortBy === 'oldest') return a.createdAt.localeCompare(b.createdAt);
    return a.title.localeCompare(b.title);
  });
  return sorted;
}
