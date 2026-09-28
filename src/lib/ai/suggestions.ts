// §4.10's suggestion formulas, kept as pure functions over already-computed embeddings so they're
// testable without a worker, a model, or a database — everything CLIP-shaped (item embeddings,
// value/prompt embeddings, neighbor similarities) is handed in by the caller
// (`src/features/ai/computeSuggestions.ts`, which does the DB/store lookups).

import type { Facet } from '@/state/types';
import { cosineSimilarity } from './embeddingProvider';

export interface FacetConfig {
  /** How many suggestions to surface at most. */
  topN: number;
  /** The minimum blended score (or, for `tag`, the minimum personal score) to surface at all. */
  minScore: number;
  /** Zero-shot suggestions don't apply to tags (§4.10, Appendix B) — personal neighbors only. */
  usesZeroShot: boolean;
}

export const FACET_CONFIG: Record<Facet, FacetConfig> = {
  type: { topN: 1, minScore: 0.35, usesZeroShot: true },
  vibe: { topN: 3, minScore: 0.2, usesZeroShot: true },
  movement: { topN: 2, minScore: 0.25, usesZeroShot: true },
  tag: { topN: 5, minScore: 0.3, usesZeroShot: false },
};

export interface NeighborItem {
  /** cos(e_i, e_j) — the candidate item's embedding against this neighbor's. */
  similarity: number;
  /** This neighbor's term ids, restricted to the facet being scored. */
  termIdsInFacet: string[];
}

export interface Suggestion {
  termId: string;
  score: number;
}

function softmax(scores: Map<string, number>, temperature: number): Map<string, number> {
  const scaled = new Map<string, number>();
  let max = -Infinity;
  for (const s of scores.values()) max = Math.max(max, s * temperature);
  let sum = 0;
  for (const [id, s] of scores) {
    const e = Math.exp(s * temperature - max);
    scaled.set(id, e);
    sum += e;
  }
  if (sum === 0) return scaled;
  for (const [id, e] of scaled) scaled.set(id, e / sum);
  return scaled;
}

/** `s_z(t) = softmax_t(100 · cos(e_i, e_t))` over the field's values. */
export function zeroShotScores(
  itemEmbedding: Float32Array,
  valueEmbeddings: Map<string, Float32Array>,
): Map<string, number> {
  const cosines = new Map<string, number>();
  for (const [termId, vec] of valueEmbeddings) {
    cosines.set(termId, cosineSimilarity(itemEmbedding, vec));
  }
  return softmax(cosines, 100);
}

/** `s_k(t) = Σ_{j∈N, t∈terms(j)} cos(e_i,e_j) / Σ_{j∈N} cos(e_i,e_j)`, N = the (up to 15) nearest
 * classified items passed in as `neighbors`. */
export function personalScores(
  candidateTermIds: Iterable<string>,
  neighbors: NeighborItem[],
): Map<string, number> {
  const totalSimilarity = neighbors.reduce((sum, n) => sum + n.similarity, 0);
  const scores = new Map<string, number>();
  for (const termId of candidateTermIds) {
    if (totalSimilarity <= 0) {
      scores.set(termId, 0);
      continue;
    }
    const matching = neighbors
      .filter((n) => n.termIdsInFacet.includes(termId))
      .reduce((sum, n) => sum + n.similarity, 0);
    scores.set(termId, matching / totalSimilarity);
  }
  return scores;
}

/** `α = max(0.25, 1 − labeled_in_field / 150)` — favors zero-shot early in a library's life, and
 * the owner's own taste (personal neighbors) as more items get classified in this field. */
export function blendAlpha(labeledInField: number): number {
  return Math.max(0.25, 1 - labeledInField / 150);
}

export interface SuggestParams {
  facet: Facet;
  itemEmbedding: Float32Array;
  /** Every value's prompt embedding for this facet (§4.10, Appendix B) — empty/ignored for
   * `tag`, which has no zero-shot templates. */
  valueEmbeddings: Map<string, Float32Array>;
  /** The (up to 15) nearest items already classified in this facet. */
  neighbors: NeighborItem[];
  /** How many items in the library already carry at least one term in this facet — feeds
   * `blendAlpha`. */
  labeledInField: number;
  /** Already assigned to this item, or previously dismissed for it (`ai_dismissed`) — never
   * suggested again. */
  excludeTermIds: ReadonlySet<string>;
  /** "Fewer" raises every threshold by 0.1, "More" lowers it by 0.1 (§4.10) — 0 by default. */
  thresholdAdjustment?: number;
}

/** All candidate term ids this facet could suggest, gathered from both scoring sources so a term
 * that only shows up as a personal neighbor (not among the zero-shot value embeddings, e.g. a
 * newly added value that hasn't got hints yet) still gets a chance to be scored. */
function candidateTermIds(
  valueEmbeddings: Map<string, Float32Array>,
  neighbors: NeighborItem[],
): Set<string> {
  const ids = new Set<string>(valueEmbeddings.keys());
  for (const n of neighbors) for (const id of n.termIdsInFacet) ids.add(id);
  return ids;
}

export function suggestTerms(params: SuggestParams): Suggestion[] {
  const config = FACET_CONFIG[params.facet];
  const candidates = candidateTermIds(params.valueEmbeddings, params.neighbors);
  const personal = personalScores(candidates, params.neighbors);

  let blended: Map<string, number>;
  if (config.usesZeroShot) {
    const zeroShot = zeroShotScores(params.itemEmbedding, params.valueEmbeddings);
    const alpha = blendAlpha(params.labeledInField);
    blended = new Map();
    for (const termId of candidates) {
      const sz = zeroShot.get(termId) ?? 0;
      const sk = personal.get(termId) ?? 0;
      blended.set(termId, alpha * sz + (1 - alpha) * sk);
    }
  } else {
    blended = personal;
  }

  const adjustment = params.thresholdAdjustment ?? 0;
  const minScore = config.minScore + adjustment;

  return Array.from(blended.entries())
    .filter(([termId]) => !params.excludeTermIds.has(termId))
    .filter(([, score]) => score >= minScore)
    .sort((a, b) => b[1] - a[1])
    .slice(0, config.topN)
    .map(([termId, score]) => ({ termId, score }));
}
