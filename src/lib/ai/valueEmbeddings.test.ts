import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getValueEmbedding,
  getValueEmbeddings,
  invalidateValueEmbeddings,
} from './valueEmbeddings';
import { FakeEmbeddingProvider } from './fakeEmbeddingProvider';
import type { Term } from '@/state/types';

function term(overrides: Partial<Term> = {}): Term {
  return {
    id: 't1',
    facet: 'vibe',
    name: 'cozy',
    nameNorm: 'cozy',
    aiHint: null,
    sort: 0,
    createdAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

beforeEach(() => {
  invalidateValueEmbeddings();
});

describe('getValueEmbedding', () => {
  it('returns null for a facet with no prompt templates (tags)', async () => {
    const provider = new FakeEmbeddingProvider();
    const result = await getValueEmbedding(provider, term({ facet: 'tag' }));
    expect(result).toBeNull();
  });

  it('averages and L2-normalizes across every template', async () => {
    const provider = new FakeEmbeddingProvider();
    const result = await getValueEmbedding(provider, term());
    expect(result).not.toBeNull();
    let sumSquares = 0;
    for (const x of result!) sumSquares += x * x;
    expect(Math.sqrt(sumSquares)).toBeCloseTo(1, 5);
  });

  it('uses the AI hint over the name when present', async () => {
    const provider = new FakeEmbeddingProvider();
    const withHint = await getValueEmbedding(
      provider,
      term({ id: 'a', aiHint: 'warm and inviting' }),
    );
    invalidateValueEmbeddings();
    const withoutHint = await getValueEmbedding(
      provider,
      term({ id: 'a', name: 'totally different' }),
    );
    expect(Array.from(withHint!)).not.toEqual(Array.from(withoutHint!));
  });

  it('caches — a second call does not re-embed', async () => {
    const provider = new FakeEmbeddingProvider();
    const embedText = vi.spyOn(provider, 'embedText');
    const t = term();
    await getValueEmbedding(provider, t);
    const callsAfterFirst = embedText.mock.calls.length;
    await getValueEmbedding(provider, t);
    expect(embedText.mock.calls.length).toBe(callsAfterFirst);
  });

  it('invalidateValueEmbeddings(termId) forces a recompute for just that term', async () => {
    const provider = new FakeEmbeddingProvider();
    const embedText = vi.spyOn(provider, 'embedText');
    const t = term();
    await getValueEmbedding(provider, t);
    const callsAfterFirst = embedText.mock.calls.length;
    invalidateValueEmbeddings(t.id);
    await getValueEmbedding(provider, t);
    expect(embedText.mock.calls.length).toBeGreaterThan(callsAfterFirst);
  });
});

describe('getValueEmbeddings', () => {
  it('skips tags and includes every zero-shot-eligible facet', async () => {
    const provider = new FakeEmbeddingProvider();
    const terms = [
      term({ id: 'a', facet: 'vibe' }),
      term({ id: 'b', facet: 'tag' }),
      term({ id: 'c', facet: 'type' }),
    ];
    const result = await getValueEmbeddings(provider, terms);
    expect(Array.from(result.keys()).sort()).toEqual(['a', 'c']);
  });
});
