// §4.10: "for each value, fill its field's prompt templates (Appendix B) with its AI hint (or
// its name), then average and normalize. They're cached and recomputed when a vocabulary
// changes." The cache lives here, in memory, for the session — `invalidateValueEmbeddings` is
// called by the vocabulary commands (rename, hint edit, merge, delete) whenever a mutation could
// change a value's prompt text.

import type { Term } from '@/state/types';
import { l2Normalize } from './embeddingProvider';
import { promptsFor } from './promptTemplates';

export interface TextEmbedder {
  embedText(text: string): Promise<Float32Array>;
}

const cache = new Map<string, Float32Array>();

export function invalidateValueEmbeddings(termId?: string): void {
  if (termId) cache.delete(termId);
  else cache.clear();
}

/** `null` for a term whose facet has no zero-shot templates (tags — Appendix B). */
export async function getValueEmbedding(
  embedder: TextEmbedder,
  term: Term,
): Promise<Float32Array | null> {
  const templates = promptsFor(term.facet, term.aiHint ?? term.name);
  if (templates.length === 0) return null;

  const cached = cache.get(term.id);
  if (cached) return cached;

  const vectors = await Promise.all(templates.map((prompt) => embedder.embedText(prompt)));
  const dims = vectors[0]?.length ?? 0;
  const sum = new Float32Array(dims);
  for (const v of vectors) for (let i = 0; i < dims; i++) sum[i] += v[i];
  const embedding = l2Normalize(sum);
  cache.set(term.id, embedding);
  return embedding;
}

/** All of a facet's value embeddings, keyed by term id — the shape `suggestTerms` expects for
 * `valueEmbeddings`. Terms with no template (tags) are simply absent from the result. */
export async function getValueEmbeddings(
  embedder: TextEmbedder,
  terms: Term[],
): Promise<Map<string, Float32Array>> {
  const result = new Map<string, Float32Array>();
  for (const term of terms) {
    const embedding = await getValueEmbedding(embedder, term);
    if (embedding) result.set(term.id, embedding);
  }
  return result;
}
