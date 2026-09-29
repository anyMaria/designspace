import { describe, expect, it } from 'vitest';
import { findSimilarItemIds, FIND_SIMILAR_LIMIT, FIND_SIMILAR_THRESHOLD } from './findSimilar';
import { l2Normalize } from './embeddingProvider';

function vec(...values: number[]): Float32Array {
  return l2Normalize(Float32Array.from(values));
}

describe('findSimilarItemIds', () => {
  it('returns [] when the item has no embedding', () => {
    const result = findSimilarItemIds('missing', new Map([['a', vec(1, 0, 0)]]));
    expect(result).toEqual([]);
  });

  it('excludes items below the threshold', () => {
    const embeddings = new Map([
      ['target', vec(1, 0, 0)],
      ['close', vec(0.99, 0.01, 0)],
      ['far', vec(0, 1, 0)],
    ]);
    const result = findSimilarItemIds('target', embeddings);
    expect(result.map((r) => r.id)).toContain('close');
    expect(result.map((r) => r.id)).not.toContain('far');
  });

  it('never includes the item itself', () => {
    const embeddings = new Map([['target', vec(1, 0, 0)]]);
    const result = findSimilarItemIds('target', embeddings);
    expect(result.map((r) => r.id)).not.toContain('target');
  });

  it('excludes ids passed in excludeIds even if above threshold', () => {
    const embeddings = new Map([
      ['target', vec(1, 0, 0)],
      ['close', vec(0.99, 0.01, 0)],
    ]);
    const result = findSimilarItemIds('target', embeddings, new Set(['close']));
    expect(result).toEqual([]);
  });

  it('sorts descending by score and caps at FIND_SIMILAR_LIMIT', () => {
    const embeddings = new Map<string, Float32Array>([['target', vec(1, 0, 0)]]);
    for (let i = 0; i < 40; i++) {
      // Slightly different angles, all above threshold, decreasing similarity.
      embeddings.set(`item${i}`, vec(1, i * 0.001, 0));
    }
    const result = findSimilarItemIds('target', embeddings);
    expect(result.length).toBeLessThanOrEqual(FIND_SIMILAR_LIMIT);
    for (let i = 1; i < result.length; i++) {
      expect(result[i - 1].score).toBeGreaterThanOrEqual(result[i].score);
    }
  });

  it('exports the documented threshold', () => {
    expect(FIND_SIMILAR_THRESHOLD).toBe(0.75);
  });
});
