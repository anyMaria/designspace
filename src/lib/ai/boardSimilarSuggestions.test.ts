import { describe, expect, it } from 'vitest';
import { boardSimilarSuggestions } from './boardSimilarSuggestions';
import { l2Normalize } from './embeddingProvider';

function vec(...values: number[]): Float32Array {
  return l2Normalize(Float32Array.from(values));
}

describe('boardSimilarSuggestions', () => {
  it('returns [] when none of the placed items have an embedding', () => {
    const result = boardSimilarSuggestions(['a', 'b'], new Map(), new Set(), 10);
    expect(result).toEqual([]);
  });

  it('finds items near the centroid of the placed items', () => {
    const embeddings = new Map([
      ['placed1', vec(1, 0, 0)],
      ['placed2', vec(0.9, 0.1, 0)],
      ['candidate-close', vec(0.95, 0.05, 0)],
      ['candidate-far', vec(0, 0, 1)],
    ]);
    const result = boardSimilarSuggestions(
      ['placed1', 'placed2'],
      embeddings,
      new Set(['placed1', 'placed2']),
      10,
    );
    expect(result).toContain('candidate-close');
    expect(result).not.toContain('candidate-far');
  });

  it('excludes ids in excludeIds even above threshold', () => {
    const embeddings = new Map([
      ['placed1', vec(1, 0, 0)],
      ['candidate', vec(0.99, 0.01, 0)],
    ]);
    const result = boardSimilarSuggestions(
      ['placed1'],
      embeddings,
      new Set(['placed1', 'candidate']),
      10,
    );
    expect(result).toEqual([]);
  });

  it('respects the limit', () => {
    const embeddings = new Map<string, Float32Array>([['placed1', vec(1, 0, 0)]]);
    for (let i = 0; i < 20; i++) embeddings.set(`c${i}`, vec(1, i * 0.0001, 0));
    const result = boardSimilarSuggestions(['placed1'], embeddings, new Set(['placed1']), 5);
    expect(result.length).toBeLessThanOrEqual(5);
  });
});
