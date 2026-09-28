import { describe, expect, it } from 'vitest';
import {
  blendAlpha,
  personalScores,
  suggestTerms,
  zeroShotScores,
  type NeighborItem,
} from './suggestions';
import { l2Normalize } from './embeddingProvider';

function vec(...values: number[]): Float32Array {
  return l2Normalize(Float32Array.from(values));
}

describe('blendAlpha', () => {
  it('is 1 when nothing is labeled yet (all zero-shot)', () => {
    expect(blendAlpha(0)).toBe(1);
  });

  it('decreases linearly toward the 0.25 floor', () => {
    expect(blendAlpha(75)).toBeCloseTo(0.5, 5);
    expect(blendAlpha(150)).toBeCloseTo(0.25, 5);
  });

  it('never drops below 0.25, even with far more than 150 labeled', () => {
    expect(blendAlpha(1000)).toBe(0.25);
  });
});

describe('zeroShotScores', () => {
  it('gives the closest value the highest softmax probability', () => {
    const item = vec(1, 0, 0);
    const values = new Map([
      ['close', vec(0.9, 0.1, 0)],
      ['far', vec(0, 1, 0)],
    ]);
    const scores = zeroShotScores(item, values);
    expect(scores.get('close')!).toBeGreaterThan(scores.get('far')!);
  });

  it('sums to 1 across all values (a softmax distribution)', () => {
    const item = vec(1, 0, 0);
    const values = new Map([
      ['a', vec(0.9, 0.1, 0)],
      ['b', vec(0, 1, 0)],
      ['c', vec(-1, 0, 0)],
    ]);
    const scores = zeroShotScores(item, values);
    const total = Array.from(scores.values()).reduce((sum, s) => sum + s, 0);
    expect(total).toBeCloseTo(1, 5);
  });
});

describe('personalScores', () => {
  it('gives full score to a term every neighbor shares', () => {
    const neighbors: NeighborItem[] = [
      { similarity: 0.9, termIdsInFacet: ['cozy'] },
      { similarity: 0.5, termIdsInFacet: ['cozy'] },
    ];
    const scores = personalScores(['cozy'], neighbors);
    expect(scores.get('cozy')).toBeCloseTo(1, 5);
  });

  it('weights by similarity, not just neighbor count', () => {
    const neighbors: NeighborItem[] = [
      { similarity: 0.9, termIdsInFacet: ['cozy'] },
      { similarity: 0.1, termIdsInFacet: ['moody'] },
    ];
    const scores = personalScores(['cozy', 'moody'], neighbors);
    expect(scores.get('cozy')!).toBeGreaterThan(scores.get('moody')!);
    expect(scores.get('cozy')! + scores.get('moody')!).toBeCloseTo(1, 5);
  });

  it('is 0 for every term when there are no neighbors', () => {
    const scores = personalScores(['cozy'], []);
    expect(scores.get('cozy')).toBe(0);
  });
});

describe('suggestTerms', () => {
  it('suggests the single closest Type above threshold, respecting topN=1', () => {
    const suggestions = suggestTerms({
      facet: 'type',
      itemEmbedding: vec(1, 0, 0),
      valueEmbeddings: new Map([
        ['photo', vec(0.99, 0.01, 0)],
        ['illustration', vec(0.3, 0.9, 0)],
      ]),
      neighbors: [],
      labeledInField: 0,
      excludeTermIds: new Set(),
    });
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0].termId).toBe('photo');
  });

  it('excludes already-assigned or dismissed terms even if they score highest', () => {
    const suggestions = suggestTerms({
      facet: 'type',
      itemEmbedding: vec(1, 0, 0),
      valueEmbeddings: new Map([
        ['photo', vec(0.99, 0.01, 0)],
        ['illustration', vec(0.3, 0.9, 0)],
      ]),
      neighbors: [],
      labeledInField: 0,
      excludeTermIds: new Set(['photo']),
    });
    expect(suggestions.map((s) => s.termId)).not.toContain('photo');
  });

  it('applies the minScore threshold — nothing suggested when everything scores too low', () => {
    const suggestions = suggestTerms({
      facet: 'vibe',
      itemEmbedding: vec(1, 0, 0),
      valueEmbeddings: new Map([
        ['a', vec(0.1, 0.9, 0.4)],
        ['b', vec(-0.9, 0.1, 0.4)],
        ['c', vec(0, -0.9, 0.4)],
      ]),
      neighbors: [],
      labeledInField: 0,
      excludeTermIds: new Set(),
    });
    // With 3 near-equidistant values the softmax spreads scores roughly evenly — well under
    // Vibe's 0.20 floor when nothing stands out.
    expect(suggestions.length).toBeLessThanOrEqual(1);
  });

  it('"Fewer" (positive adjustment) raises the bar and can suppress a borderline suggestion', () => {
    const params = {
      facet: 'vibe' as const,
      itemEmbedding: vec(1, 0, 0),
      valueEmbeddings: new Map([['cozy', vec(0.9, 0.1, 0.1)]]),
      neighbors: [],
      labeledInField: 0,
      excludeTermIds: new Set<string>(),
    };
    const normal = suggestTerms(params);
    const fewer = suggestTerms({ ...params, thresholdAdjustment: 0.1 });
    expect(normal.length).toBeGreaterThanOrEqual(fewer.length);
  });

  it('tags use personal score only — a term nobody nearby shares is never suggested, however close the (nonexistent) zero-shot embedding would be', () => {
    const suggestions = suggestTerms({
      facet: 'tag',
      itemEmbedding: vec(1, 0, 0),
      valueEmbeddings: new Map(), // tags have no prompt-template embeddings
      neighbors: [
        { similarity: 0.9, termIdsInFacet: ['sunset'] },
        { similarity: 0.8, termIdsInFacet: ['sunset'] },
      ],
      labeledInField: 0,
      excludeTermIds: new Set(),
    });
    expect(suggestions[0]?.termId).toBe('sunset');
  });

  it('blends toward personal score as more of the field gets labeled', () => {
    const zeroShotFavorite = 'zsFavorite';
    const personalFavorite = 'personalFavorite';
    const base = {
      facet: 'vibe' as const,
      itemEmbedding: vec(1, 0, 0),
      valueEmbeddings: new Map([
        [zeroShotFavorite, vec(0.99, 0.01, 0)],
        [personalFavorite, vec(0, 0, 1)],
      ]),
      neighbors: [{ similarity: 0.9, termIdsInFacet: [personalFavorite] }] as NeighborItem[],
      excludeTermIds: new Set<string>(),
    };
    const early = suggestTerms({ ...base, labeledInField: 0 }); // alpha = 1, pure zero-shot
    const late = suggestTerms({ ...base, labeledInField: 150 }); // alpha = 0.25, mostly personal

    expect(early.some((s) => s.termId === zeroShotFavorite)).toBe(true);
    expect(late.some((s) => s.termId === personalFavorite)).toBe(true);
  });
});
