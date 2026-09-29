import { describe, expect, it } from 'vitest';
import {
  searchByMeaning,
  SEARCH_BY_MEANING_LIMIT,
  SEARCH_BY_MEANING_THRESHOLD,
} from './searchByMeaning';
import { l2Normalize } from './embeddingProvider';

function vec(...values: number[]): Float32Array {
  return l2Normalize(Float32Array.from(values));
}

describe('searchByMeaning', () => {
  it('returns items at or above the threshold, sorted by score', () => {
    const query = vec(1, 0, 0);
    const embeddings = new Map([
      ['close', vec(0.9, 0.1, 0)],
      ['closer', vec(0.99, 0.01, 0)],
      ['far', vec(-1, 0, 0)],
    ]);
    const results = searchByMeaning(query, embeddings);
    expect(results[0]).toBe('closer');
    expect(results).toContain('close');
    expect(results).not.toContain('far');
  });

  it('caps results at SEARCH_BY_MEANING_LIMIT', () => {
    const query = vec(1, 0, 0);
    const embeddings = new Map<string, Float32Array>();
    for (let i = 0; i < 80; i++) embeddings.set(`item${i}`, vec(1, i * 0.0001, 0));
    const results = searchByMeaning(query, embeddings);
    expect(results.length).toBeLessThanOrEqual(SEARCH_BY_MEANING_LIMIT);
  });

  it('exports the documented threshold', () => {
    expect(SEARCH_BY_MEANING_THRESHOLD).toBe(0.22);
  });
});
