import { cosineSimilarity } from './embeddingProvider';

/** §4.10: "Search by meaning: embed the query text, then return the top 50 items with cosine ≥
 * 0.22 (CLIP scale, to tune)." Pure and synchronous — the caller already has the query embedding
 * (from `AiQueue.embedText`) and the in-memory embeddings map. */
export const SEARCH_BY_MEANING_THRESHOLD = 0.22;
export const SEARCH_BY_MEANING_LIMIT = 50;

export function searchByMeaning(
  queryVector: Float32Array,
  embeddings: Map<string, Float32Array>,
): string[] {
  const results: { id: string; score: number }[] = [];
  for (const [itemId, vector] of embeddings) {
    const score = cosineSimilarity(queryVector, vector);
    if (score >= SEARCH_BY_MEANING_THRESHOLD) results.push({ id: itemId, score });
  }
  results.sort((a, b) => b.score - a.score);
  return results.slice(0, SEARCH_BY_MEANING_LIMIT).map((r) => r.id);
}
