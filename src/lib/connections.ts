import type { Facet, Item, ManualConnection, Term } from '@/state/types';
import { cosineSimilarity } from '@/lib/ai/embeddingProvider';

/** Connection criteria (§2.10, §4.9). */
export type Criterion = Facet | 'color' | 'manual' | 'similar';

/** §4.10/§2.10: "Similar look", cosine on CLIP embeddings. Unlike every other criterion,
 * `similar` has no discrete "value" items can share — it's scored directly from embeddings in
 * `scoreCandidates` (mirroring how `manual` is special-cased there), never through the inverted
 * index, so it never produces Show-all hubs (there's no natural group to hub around a continuous
 * similarity). */
export const SIMILAR_THRESHOLD = 0.85;

export interface ConnectionIndex {
  /** itemId -> its value set, per criterion (term ids for the four facets, color family names
   * for `color`, connected item ids for `manual`). */
  valuesByItem: Map<Criterion, Map<string, Set<string>>>;
  /** value -> the item ids that carry it, per criterion — the inverted index candidates come
   * from, so scoring one hover never has to scan every item. */
  itemsByValue: Map<Criterion, Map<string, Set<string>>>;
  createdAt: Map<string, string>;
  /** `similar`'s CLIP embeddings, passed straight through — see the `SIMILAR_THRESHOLD` doc
   * comment above for why this doesn't feed the inverted index. `undefined` when the caller
   * doesn't have embeddings on hand (e.g. no AI worker), same as "no items carry this facet". */
  embeddings?: Map<string, Float32Array>;
}

const FACETS: Facet[] = ['type', 'vibe', 'movement', 'tag'];

/** Builds the per-criterion value sets and their inverted index once per data change (items,
 * classification or manual connections) — §4.9's "candidates... from the inverted index". Cheap
 * enough to rebuild on every store change, the same call this codebase already makes for the
 * search engine's facet sets. */
export function buildConnectionIndex(
  items: Iterable<Item>,
  itemTerms: Map<string, Set<string>>,
  terms: Map<string, Term>,
  manualConnections: Iterable<ManualConnection>,
  embeddings?: Map<string, Float32Array>,
): ConnectionIndex {
  const valuesByItem = new Map<Criterion, Map<string, Set<string>>>();
  const itemsByValue = new Map<Criterion, Map<string, Set<string>>>();
  const createdAt = new Map<string, string>();

  function addValue(criterion: Criterion, itemId: string, value: string): void {
    let byItem = valuesByItem.get(criterion);
    if (!byItem) valuesByItem.set(criterion, (byItem = new Map<string, Set<string>>()));
    let itemSet = byItem.get(itemId);
    if (!itemSet) byItem.set(itemId, (itemSet = new Set<string>()));
    itemSet.add(value);

    let byValue = itemsByValue.get(criterion);
    if (!byValue) itemsByValue.set(criterion, (byValue = new Map<string, Set<string>>()));
    let valueSet = byValue.get(value);
    if (!valueSet) byValue.set(value, (valueSet = new Set<string>()));
    valueSet.add(itemId);
  }

  for (const item of items) {
    if (item.deletedAt) continue;
    createdAt.set(item.id, item.createdAt);

    const termIds = itemTerms.get(item.id);
    if (termIds) {
      for (const termId of termIds) {
        const term = terms.get(termId);
        if (term && (FACETS as string[]).includes(term.facet))
          addValue(term.facet, item.id, termId);
      }
    }
    for (const family of item.colorFamilies ?? []) addValue('color', item.id, family);
  }

  for (const c of manualConnections) {
    addValue('manual', c.fromId, c.toId);
    addValue('manual', c.toId, c.fromId);
  }

  return { valuesByItem, itemsByValue, createdAt, embeddings };
}

export function valueSetFor(
  index: ConnectionIndex,
  criterion: Criterion,
  itemId: string,
): Set<string> {
  return index.valuesByItem.get(criterion)?.get(itemId) ?? new Set();
}

export interface ScoredCandidate {
  id: string;
  score: number;
  /** Which criteria this candidate shares with the hovered item, and which values — the tooltip
   * text ("Shared · Vibe: Dreamy · Tags: serif, grain") reads straight off this. */
  shared: Partial<Record<Criterion, string[]>>;
}

/** §4.9's hover scoring: `score(j) = Σ_c |V_c(i) ∩ V_c(j)|`, +1 per manual connection (already
 * folded in above, since `manual`'s "value" IS the connected item — a shared manual connection
 * contributes exactly 1 via the normal intersection-size math). Candidates below `minStrength`
 * are dropped; the rest are sorted by score descending, ties broken by newest, capped to 40. */
export function scoreCandidates(
  itemId: string,
  activeCriteria: Criterion[],
  index: ConnectionIndex,
  minStrength = 1,
): ScoredCandidate[] {
  const scores = new Map<string, number>();
  const shared = new Map<string, Partial<Record<Criterion, string[]>>>();

  for (const criterion of activeCriteria) {
    if (criterion === 'similar') {
      const embeddings = index.embeddings;
      const myVector = embeddings?.get(itemId);
      if (!embeddings || !myVector) continue;
      for (const [otherId, otherVector] of embeddings) {
        if (otherId === itemId) continue;
        const similarity = cosineSimilarity(myVector, otherVector);
        if (similarity < SIMILAR_THRESHOLD) continue;
        // +1, not the raw cosine — `minStrength` counts shared *criteria*, and a qualifying
        // similarity match is exactly one of those, same as `manual`; the percentage still goes
        // into `shared` for the tooltip.
        scores.set(otherId, (scores.get(otherId) ?? 0) + 1);
        const s = shared.get(otherId) ?? {};
        (s.similar ??= []).push(`${Math.round(similarity * 100)}%`);
        shared.set(otherId, s);
      }
      continue;
    }

    const myValues = valueSetFor(index, criterion, itemId);
    if (criterion === 'manual') {
      // A manual connection's "value" is the neighbor's own id, not a shared attribute other
      // items could also hold — the connected item itself is the one candidate it contributes.
      for (const otherId of myValues) {
        scores.set(otherId, (scores.get(otherId) ?? 0) + 1);
        const s = shared.get(otherId) ?? {};
        (s.manual ??= []).push(otherId);
        shared.set(otherId, s);
      }
      continue;
    }
    const byValue = index.itemsByValue.get(criterion);
    if (!byValue) continue;
    for (const value of myValues) {
      const holders = byValue.get(value);
      if (!holders) continue;
      for (const otherId of holders) {
        if (otherId === itemId) continue;
        scores.set(otherId, (scores.get(otherId) ?? 0) + 1);
        const s = shared.get(otherId) ?? {};
        (s[criterion] ??= []).push(value);
        shared.set(otherId, s);
      }
    }
  }

  const candidates: ScoredCandidate[] = [...scores.entries()]
    .filter(([, score]) => score >= minStrength)
    .map(([id, score]) => ({ id, score, shared: shared.get(id) ?? {} }));

  candidates.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    const aDate = index.createdAt.get(a.id) ?? '';
    const bDate = index.createdAt.get(b.id) ?? '';
    return bDate.localeCompare(aDate); // ties -> newest
  });

  return candidates.slice(0, 40);
}

/** "With several items selected, only the connections among them show" (§2.10) — restricts a
 * hovered/selected item's candidates to the rest of the selection. */
export function restrictToSelection(
  candidates: ScoredCandidate[],
  selection: Set<string>,
): ScoredCandidate[] {
  return candidates.filter((c) => selection.has(c.id));
}

export const CRITERION_ORDER: Criterion[] = [
  'type',
  'vibe',
  'movement',
  'tag',
  'color',
  'manual',
  'similar',
];

/** The line hover tooltip text (§2.10: "Shared · Vibe: Dreamy · Tags: serif, grain"). `terms`
 * resolves facet term ids back to their names; `color`'s values are already the family names
 * themselves, and `manual` has no "value" beyond the connection existing. */
export function formatSharedTooltip(
  shared: Partial<Record<Criterion, string[]>>,
  terms: Map<string, Term>,
  labels: Record<Criterion, string>,
): string {
  const parts: string[] = [];
  for (const criterion of CRITERION_ORDER) {
    const values = shared[criterion];
    if (!values || values.length === 0) continue;
    if (criterion === 'manual') {
      parts.push(labels.manual);
      continue;
    }
    const names = criterion === 'color' ? values : values.map((id) => terms.get(id)?.name ?? id);
    parts.push(`${labels[criterion]}: ${names.join(', ')}`);
  }
  return parts.join(' · ');
}

/** §2.10/§4.9's "Show all": a value shared by 2+ visible items becomes a hub, placed (by the
 * caller, which owns item positions) at the centroid of its member items. `manual` reuses the
 * same inverted index as every other criterion without special-casing: `itemsByValue['manual']`
 * already maps an item id to everyone connected to it (`buildConnectionIndex` adds both
 * directions), so a hub for that "value" is exactly "the items manually connected to this one" —
 * the natural Show-all reading of My connections, and it falls out of the existing structure for
 * free. `similar` never produces hubs — see `SIMILAR_THRESHOLD`'s doc comment for why it's
 * deliberately absent from the inverted index `computeHubs` reads. */
export interface Hub {
  criterion: Criterion;
  /** The term id (facets), color family (`color`), or connected item id (`manual`). */
  value: string;
  itemIds: string[];
}

/** §2.10: "At most 5,000 lines are drawn." One line per item-to-hub edge. */
export const MAX_SHOW_ALL_LINES = 5000;

export interface ShowAllResult {
  hubs: Hub[];
  edgeCount: number;
  overLimit: boolean;
}

export function computeHubs(
  visibleIds: Iterable<string>,
  activeCriteria: Criterion[],
  index: ConnectionIndex,
): ShowAllResult {
  const visible = visibleIds instanceof Set ? visibleIds : new Set(visibleIds);
  const hubs: Hub[] = [];
  let edgeCount = 0;

  for (const criterion of activeCriteria) {
    const byValue = index.itemsByValue.get(criterion);
    if (!byValue) continue;
    for (const [value, itemSet] of byValue) {
      const itemIds = [...itemSet].filter((id) => visible.has(id));
      if (itemIds.length < 2) continue;
      hubs.push({ criterion, value, itemIds });
      edgeCount += itemIds.length;
    }
  }

  return { hubs, edgeCount, overLimit: edgeCount > MAX_SHOW_ALL_LINES };
}

/** The hub's display label — a term name, a color family name, or (for `manual`) the connected
 * item's own title, since that "value" is an item id rather than a shared attribute. */
export function formatHubLabel(
  hub: Hub,
  terms: Map<string, Term>,
  itemTitles: Map<string, string>,
): string {
  if (hub.criterion === 'manual') return itemTitles.get(hub.value) ?? hub.value;
  if (hub.criterion === 'color') return hub.value;
  return terms.get(hub.value)?.name ?? hub.value;
}
