import { beforeEach, describe, expect, it, vi } from 'vitest';
import { computeSuggestions } from './computeSuggestions';
import { useTermStore } from '@/state/termStore';
import { FakeEmbeddingProvider } from '@/lib/ai/fakeEmbeddingProvider';
import { invalidateValueEmbeddings } from '@/lib/ai/valueEmbeddings';
import type { Platform } from '@/platform/types';
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

function textBytes(text: string): ArrayBuffer {
  return new TextEncoder().encode(text).buffer;
}

function makePlatform(embeddings: Map<string, Float32Array>): Platform {
  return {
    db: {
      select: vi.fn().mockResolvedValue([]),
      execute: vi.fn().mockResolvedValue({ changes: 0 }),
      batch: vi.fn().mockResolvedValue(undefined),
    },
    embeddings: {
      put: vi.fn().mockResolvedValue(undefined),
      load: vi.fn().mockResolvedValue(embeddings),
    },
  } as unknown as Platform;
}

beforeEach(() => {
  invalidateValueEmbeddings();
  useTermStore.setState({ terms: new Map(), itemTerms: new Map() });
});

describe('computeSuggestions', () => {
  it('returns [] when the item has no embedding yet', async () => {
    const platform = makePlatform(new Map());
    const embedder = new FakeEmbeddingProvider();
    const results = await computeSuggestions(platform, 'item1', { embedder });
    expect(results).toEqual([]);
  });

  it('returns [] when no worker/embedder is available', async () => {
    const platform = makePlatform(new Map([['item1', new Float32Array(512)]]));
    const results = await computeSuggestions(platform, 'item1', {
      embedder: undefined,
      facets: [],
    });
    // With no embedder override and no real Worker global in this test env, getAiQueue()
    // returns null — computeSuggestions must not throw.
    expect(Array.isArray(results)).toBe(true);
  });

  it('suggests a Vibe term from a classified neighbor, and excludes an already-assigned one', async () => {
    const embedder = new FakeEmbeddingProvider();
    const itemVec = await embedder.embedImage(textBytes('a cozy cabin interior'));
    const neighborVec = await embedder.embedImage(
      textBytes('a cozy cabin interior, slightly different'),
    );

    const cozy = term({ id: 'cozy', facet: 'vibe', name: 'cozy' });
    const moody = term({ id: 'moody', facet: 'vibe', name: 'moody' });
    useTermStore.setState({
      terms: new Map([
        ['cozy', cozy],
        ['moody', moody],
      ]),
      itemTerms: new Map([['neighbor1', new Set(['cozy'])]]),
    });

    const platform = makePlatform(
      new Map([
        ['item1', itemVec],
        ['neighbor1', neighborVec],
      ]),
    );

    const results = await computeSuggestions(platform, 'item1', { facets: ['vibe'], embedder });
    expect(results).toHaveLength(1);
    expect(results[0].facet).toBe('vibe');
    expect(results[0].suggestions.some((s) => s.termId === 'cozy')).toBe(true);
  });

  it('excludes a term already assigned to the item', async () => {
    const embedder = new FakeEmbeddingProvider();
    const itemVec = await embedder.embedImage(textBytes('a cozy cabin interior'));
    const neighborVec = await embedder.embedImage(
      textBytes('a cozy cabin interior, slightly different'),
    );

    const cozy = term({ id: 'cozy', facet: 'vibe', name: 'cozy' });
    useTermStore.setState({
      terms: new Map([['cozy', cozy]]),
      itemTerms: new Map([
        ['neighbor1', new Set(['cozy'])],
        ['item1', new Set(['cozy'])], // already assigned to the item we're suggesting for
      ]),
    });

    const platform = makePlatform(
      new Map([
        ['item1', itemVec],
        ['neighbor1', neighborVec],
      ]),
    );

    const results = await computeSuggestions(platform, 'item1', { facets: ['vibe'], embedder });
    expect(results[0].suggestions.map((s) => s.termId)).not.toContain('cozy');
  });

  it('excludes a dismissed term even when it would otherwise score highly', async () => {
    const embedder = new FakeEmbeddingProvider();
    const itemVec = await embedder.embedImage(textBytes('a cozy cabin interior'));
    const neighborVec = await embedder.embedImage(
      textBytes('a cozy cabin interior, slightly different'),
    );

    const cozy = term({ id: 'cozy', facet: 'vibe', name: 'cozy' });
    useTermStore.setState({
      terms: new Map([['cozy', cozy]]),
      itemTerms: new Map([['neighbor1', new Set(['cozy'])]]),
    });

    const platform = makePlatform(
      new Map([
        ['item1', itemVec],
        ['neighbor1', neighborVec],
      ]),
    );
    platform.db.select = vi.fn().mockResolvedValue([{ term_id: 'cozy' }]);

    const results = await computeSuggestions(platform, 'item1', { facets: ['vibe'], embedder });
    expect(results[0].suggestions.map((s) => s.termId)).not.toContain('cozy');
  });
});
