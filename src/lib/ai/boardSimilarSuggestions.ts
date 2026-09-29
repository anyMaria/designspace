import { cosineSimilarity, l2Normalize } from './embeddingProvider';
import { FIND_SIMILAR_THRESHOLD } from './findSimilar';

/** The suggestions tray's similarity-based half (§2.11, §4.10 — "Similarity-based suggestions
 * land in M6"): the centroid of the board's own placed items (embedded, averaged, normalized),
 * compared against every other library item. Reuses `FIND_SIMILAR_THRESHOLD` (0.75) — a board is
 * itself a "find things like these", just averaged over several items instead of one. */
export function boardSimilarSuggestions(
  placedItemIds: Iterable<string>,
  embeddings: Map<string, Float32Array>,
  excludeIds: ReadonlySet<string>,
  limit: number,
): string[] {
  const placedVectors: Float32Array[] = [];
  for (const id of placedItemIds) {
    const v = embeddings.get(id);
    if (v) placedVectors.push(v);
  }
  if (placedVectors.length === 0 || limit <= 0) return [];

  const dims = placedVectors[0].length;
  const sum = new Float32Array(dims);
  for (const v of placedVectors) for (let i = 0; i < dims; i++) sum[i] += v[i];
  const centroid = l2Normalize(sum);

  const scored: { id: string; score: number }[] = [];
  for (const [id, vector] of embeddings) {
    if (excludeIds.has(id)) continue;
    const score = cosineSimilarity(centroid, vector);
    if (score >= FIND_SIMILAR_THRESHOLD) scored.push({ id, score });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map((s) => s.id);
}
