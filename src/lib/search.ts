import MiniSearch from 'minisearch';
import type { Item, ItemKind, Term, Facet } from '@/state/types';
import type { ColorFamily } from './color';
import { normalize } from './normalize';

/** Search engine (§4.8): a MiniSearch free-text index plus prebuilt facet sets, combined by
 * `search()`. Board filtering and "by meaning" (CLIP) results are still deferred — see
 * docs/DECISIONS.md — since Boards-as-a-filter and the AI pipeline land in later milestones;
 * `Filter` still carries their shape so the UI (M2-7) and later milestones don't need to touch
 * this type again. Notes' body text is indexed as of M4-4 (`bodyText` below). */

export interface Filter {
  text?: string;
  kinds?: ItemKind[];
  include?: Partial<Record<Facet, string[]>>; // term ids: OR within a facet, AND across facets
  exclude?: Partial<Record<Facet, string[]>>;
  colors?: ColorFamily[]; // OR
  artists?: string[];
  boards?: { in?: string[]; none?: boolean };
  favorite?: boolean;
  inbox?: boolean;
  added?: { from?: string; to?: string }; // ISO dates, inclusive
  visualMatches?: boolean; // include AI "by meaning" results (M6) — ignored until then
}

export interface SearchDoc {
  id: string;
  title: string;
  termNames: string;
  artist: string;
  sourceDomain: string;
  why: string;
  fileName: string;
  bodyText: string;
  /** A media item's long description (Patch 1 · E1). */
  description: string;
}

export function sourceDomain(url: string | null | undefined): string {
  if (!url) return '';
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

function tokenize(text: string): string[] {
  return text.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
}

/** Lowercase + diacritic-stripped tokens (§2.5/§4.8 "ignores case and accents"), the last query
 * token matched as a prefix, and 5+ character tokens get fuzzy 0.2 — all per §4.8. */
function createIndex(): MiniSearch<SearchDoc> {
  return new MiniSearch<SearchDoc>({
    idField: 'id',
    fields: [
      'title',
      'termNames',
      'artist',
      'sourceDomain',
      'why',
      'fileName',
      'bodyText',
      'description',
    ],
    tokenize,
    processTerm: (term) => normalize(term) || null,
    searchOptions: {
      boost: { termNames: 3, title: 2 },
      prefix: (_term, index, terms) => index === terms.length - 1,
      fuzzy: (term) => (term.length >= 5 ? 0.2 : false),
    },
  });
}

function termNamesFor(
  itemId: string,
  itemTerms: Map<string, Set<string>>,
  terms: Map<string, Term>,
): string {
  const ids = itemTerms.get(itemId);
  if (!ids || ids.size === 0) return '';
  return [...ids]
    .map((id) => terms.get(id)?.name)
    .filter((n): n is string => !!n)
    .join(' ');
}

function toDoc(
  item: Item,
  itemTerms: Map<string, Set<string>>,
  terms: Map<string, Term>,
): SearchDoc {
  return {
    id: item.id,
    title: item.title,
    termNames: termNamesFor(item.id, itemTerms, terms),
    artist: item.artist ?? '',
    sourceDomain: sourceDomain(item.sourceUrl),
    why: item.why ?? '',
    fileName: item.fileName ?? '',
    bodyText: item.bodyText ?? '',
    description: item.descriptionText ?? '',
  };
}

/** Rebuilds the whole text index from the current store state. Cheap enough (well under the
 * §4.8 30ms/keystroke budget even at 10,000 items — see `search.bench.test.ts`) that M2-7 can
 * call this once per store change rather than wiring MiniSearch's incremental `replace`/`discard`
 * through every command; that wiring is deferred until it's actually needed. */
export function buildSearchIndex(
  items: Iterable<Item>,
  itemTerms: Map<string, Set<string>>,
  terms: Map<string, Term>,
): MiniSearch<SearchDoc> {
  const index = createIndex();
  const docs: SearchDoc[] = [];
  for (const item of items) {
    if (item.deletedAt) continue;
    docs.push(toDoc(item, itemTerms, terms));
  }
  index.addAll(docs);
  return index;
}

interface FacetSets {
  byTerm: Map<string, Set<string>>;
  byKind: Map<ItemKind, Set<string>>;
  byColor: Map<ColorFamily, Set<string>>;
  byArtist: Map<string, Set<string>>;
  favorite: Set<string>;
  inbox: Set<string>;
  createdAt: Map<string, string>; // itemId -> ISO date, for the `added` range
}

function addTo<K>(map: Map<K, Set<string>>, key: K, id: string): void {
  let set = map.get(key);
  if (!set) {
    set = new Set();
    map.set(key, set);
  }
  set.add(id);
}

export function buildFacetSets(
  items: Iterable<Item>,
  itemTerms: Map<string, Set<string>>,
): FacetSets {
  const sets: FacetSets = {
    byTerm: new Map(),
    byKind: new Map(),
    byColor: new Map(),
    byArtist: new Map(),
    favorite: new Set(),
    inbox: new Set(),
    createdAt: new Map(),
  };
  for (const item of items) {
    if (item.deletedAt) continue;
    addTo(sets.byKind, item.kind, item.id);
    for (const family of item.colorFamilies ?? []) {
      addTo(sets.byColor, family as ColorFamily, item.id);
    }
    if (item.artist) addTo(sets.byArtist, item.artist, item.id);
    if (item.favorite) sets.favorite.add(item.id);
    if (!item.sortedAt) sets.inbox.add(item.id);
    sets.createdAt.set(item.id, item.createdAt);
    const termIds = itemTerms.get(item.id);
    if (termIds) for (const termId of termIds) addTo(sets.byTerm, termId, item.id);
  }
  return sets;
}

function union(sets: (Set<string> | undefined)[]): Set<string> | null {
  const present = sets.filter((s): s is Set<string> => !!s);
  if (present.length === 0) return null;
  const result = new Set<string>();
  for (const s of present) for (const id of s) result.add(id);
  return result;
}

function intersect(a: Set<string>, b: Set<string>): Set<string> {
  const [small, large] = a.size <= b.size ? [a, b] : [b, a];
  const result = new Set<string>();
  for (const id of small) if (large.has(id)) result.add(id);
  return result;
}

/** Evaluation order per §4.8: union within a field, intersection across fields, then subtract
 * the exclusions; if there's text, intersect with the text results too. `allIds` is the universe
 * (every non-deleted item) — the starting point when a filter has no clauses at all. */
export function evaluateFilter(
  filter: Filter,
  facets: FacetSets,
  allIds: Set<string>,
  textIds: Set<string> | null,
): Set<string> {
  let result: Set<string> | null = null;

  function intersectInto(next: Set<string> | null): void {
    if (next === null) return;
    result = result === null ? next : intersect(result, next);
  }

  if (filter.kinds?.length) intersectInto(union(filter.kinds.map((k) => facets.byKind.get(k))));
  if (filter.colors?.length) intersectInto(union(filter.colors.map((c) => facets.byColor.get(c))));
  if (filter.artists?.length)
    intersectInto(union(filter.artists.map((a) => facets.byArtist.get(a))));
  if (filter.favorite) intersectInto(facets.favorite);
  if (filter.inbox) intersectInto(facets.inbox);

  if (filter.include) {
    for (const ids of Object.values(filter.include)) {
      if (!ids?.length) continue;
      intersectInto(union(ids.map((id) => facets.byTerm.get(id))));
    }
  }

  if (filter.added?.from || filter.added?.to) {
    const inRange = new Set<string>();
    for (const [id, createdAt] of facets.createdAt) {
      if (filter.added.from && createdAt < filter.added.from) continue;
      if (filter.added.to && createdAt > filter.added.to) continue;
      inRange.add(id);
    }
    intersectInto(inRange);
  }

  let base = result ?? allIds;
  if (textIds !== null) base = intersect(base, textIds);

  if (filter.exclude) {
    const excluded = union(
      Object.values(filter.exclude).flatMap((ids) =>
        (ids ?? []).map((id) => facets.byTerm.get(id)),
      ),
    );
    if (excluded) base = new Set([...base].filter((id) => !excluded.has(id)));
  }

  return base;
}

/** Convenience wrapper: builds facet sets, runs the text query if any, and evaluates the filter
 * — the entry point M2-7's search bar calls on every keystroke/filter change. */
export function search(
  items: Iterable<Item>,
  itemTerms: Map<string, Set<string>>,
  index: MiniSearch<SearchDoc>,
  filter: Filter,
): Set<string> {
  const itemList = [...items].filter((i) => !i.deletedAt);
  const allIds = new Set(itemList.map((i) => i.id));
  const facets = buildFacetSets(itemList, itemTerms);
  const textIds = filter.text?.trim()
    ? new Set(index.search(filter.text.trim()).map((r) => String(r.id)))
    : null;
  return evaluateFilter(filter, facets, allIds, textIds);
}
