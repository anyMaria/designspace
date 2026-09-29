import type { Platform } from '@/platform/types';
import type { Facet } from '@/state/types';
import { useTermStore } from '@/state/termStore';
import { getAiQueue, CLIP_MODEL } from '@/workers/aiQueue';
import { cosineSimilarity } from '@/lib/ai/embeddingProvider';
import { getValueEmbeddings, type TextEmbedder } from '@/lib/ai/valueEmbeddings';
import { suggestTerms, type NeighborItem, type Suggestion } from '@/lib/ai/suggestions';
import { loadDismissedTermIds } from './dismissed';

const MAX_NEIGHBORS = 15;
const ALL_FACETS: Facet[] = ['type', 'vibe', 'movement', 'tag'];

export interface FacetSuggestions {
  facet: Facet;
  suggestions: Suggestion[];
}

export interface ComputeSuggestionsOptions {
  facets?: Facet[];
  /** "Fewer"/"More" — see `suggestTerms`. */
  thresholdAdjustment?: number;
  /** Overridable for tests — defaults to the shared `AiQueue` singleton. */
  embedder?: TextEmbedder;
}

/** Orchestrates §4.10's suggestion pipeline for one item: loads its CLIP embedding, finds its
 * nearest already-classified neighbors per facet, embeds the facet's values (cached —
 * `valueEmbeddings.ts`), and scores everything through the pure `suggestTerms`. Returns `[]` when
 * AI can't run at all (no worker, or this item has no embedding yet) rather than throwing — the
 * caller (Details/Triage) just shows no suggestions in that case. */
export async function computeSuggestions(
  platform: Platform,
  itemId: string,
  options: ComputeSuggestionsOptions = {},
): Promise<FacetSuggestions[]> {
  const embedder = options.embedder ?? getAiQueue(platform);
  if (!embedder) return [];

  const embeddings = await platform.embeddings.load(CLIP_MODEL);
  const itemEmbedding = embeddings.get(itemId);
  if (!itemEmbedding) return [];

  const { terms, itemTerms } = useTermStore.getState();
  const dismissed = await loadDismissedTermIds(platform, itemId);
  const facets = options.facets ?? ALL_FACETS;

  const results: FacetSuggestions[] = [];
  for (const facet of facets) {
    const facetTerms = Array.from(terms.values()).filter((t) => t.facet === facet);

    const classifiedNeighbors: NeighborItem[] = [];
    for (const [otherId, otherTermIds] of itemTerms) {
      if (otherId === itemId) continue;
      const otherEmbedding = embeddings.get(otherId);
      if (!otherEmbedding) continue;
      const termIdsInFacet = Array.from(otherTermIds).filter(
        (id) => terms.get(id)?.facet === facet,
      );
      if (termIdsInFacet.length === 0) continue;
      classifiedNeighbors.push({
        similarity: cosineSimilarity(itemEmbedding, otherEmbedding),
        termIdsInFacet,
      });
    }
    classifiedNeighbors.sort((a, b) => b.similarity - a.similarity);
    const neighbors = classifiedNeighbors.slice(0, MAX_NEIGHBORS);

    const excludeTermIds = new Set<string>(dismissed);
    for (const id of itemTerms.get(itemId) ?? []) {
      if (terms.get(id)?.facet === facet) excludeTermIds.add(id);
    }

    const valueEmbeddings = await getValueEmbeddings(embedder, facetTerms);

    const suggestions = suggestTerms({
      facet,
      itemEmbedding,
      valueEmbeddings,
      neighbors,
      // Every item classified in this facet, among those with an embedding so far — a slight
      // undercount while background analysis is still catching up, which only softens the
      // zero-shot/personal blend (`blendAlpha`) rather than breaking anything.
      labeledInField: classifiedNeighbors.length,
      excludeTermIds,
      thresholdAdjustment: options.thresholdAdjustment,
    });
    results.push({ facet, suggestions });
  }
  return results;
}
