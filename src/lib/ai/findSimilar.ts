import { cosineSimilarity } from './embeddingProvider';

/** §4.10: "Find similar: the top 30 by cosine (≥ 0.75, to tune)." Pure and synchronous — callers
 * already have the embeddings map in memory (`useEmbeddingsStore`), so this never needs its own
 * async round trip. */
export const FIND_SIMILAR_THRESHOLD = 0.75;
export const FIND_SIMILAR_LIMIT = 30;

export interface SimilarItem {
  id: string;
  score: number;
}

export function findSimilarItemIds(
  itemId: string,
  embeddings: Map<string, Float32Array>,
  excludeIds: ReadonlySet<string> = new Set(),
): SimilarItem[] {
  const itemVector = embeddings.get(itemId);
  if (!itemVector) return [];

  const results: SimilarItem[] = [];
  for (const [otherId, otherVector] of embeddings) {
    if (otherId === itemId || excludeIds.has(otherId)) continue;
    const score = cosineSimilarity(itemVector, otherVector);
    if (score >= FIND_SIMILAR_THRESHOLD) results.push({ id: otherId, score });
  }
  results.sort((a, b) => b.score - a.score);
  return results.slice(0, FIND_SIMILAR_LIMIT);
}
