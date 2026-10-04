import { describe, expect, it } from 'vitest';
import { buildSearchIndex, evaluateFilter, buildFacetSets, search } from './search';
import type { Item, Term } from '@/state/types';

function makeItem(overrides: Partial<Item> = {}): Item {
  return {
    id: 'i1',
    kind: 'image',
    title: 'Test',
    filePath: null,
    fileName: null,
    fileHash: null,
    fileSize: null,
    mime: null,
    width: null,
    height: null,
    artist: null,
    sourceUrl: null,
    why: null,
    palette: null,
    colorFamilies: null,
    phash: null,
    favorite: false,
    sortedAt: '2026-01-01T00:00:00.000Z',
    viewedAt: null,
    status: 'ok',
    derivedV: 1,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    deletedAt: null,
    ...overrides,
  };
}

function makeTerm(overrides: Partial<Term> = {}): Term {
  return {
    id: 't1',
    facet: 'vibe',
    name: 'Dreamy',
    nameNorm: 'dreamy',
    aiHint: null,
    sort: 0,
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('buildSearchIndex + text search', () => {
  it('matches the title, ignoring case and accents', () => {
    const items = [
      makeItem({ id: 'a', title: 'Rêveur Poster' }),
      makeItem({ id: 'b', title: 'Other' }),
    ];
    const index = buildSearchIndex(items, new Map(), new Map());
    const results = index.search('reveur');
    expect(results.map((r) => String(r.id))).toEqual(['a']);
  });

  it('finds an item by a word that is only in its description', () => {
    const items = [
      makeItem({ id: 'a', title: 'Poster', descriptionText: 'Warm autumn light on brick' }),
      makeItem({ id: 'b', title: 'Other' }),
    ];
    const index = buildSearchIndex(items, new Map(), new Map());
    expect(index.search('autumn').map((r) => String(r.id))).toEqual(['a']);
    expect(index.search('dig-into').map((r) => String(r.id))).toEqual([]);
  });

  it('matches the last token as a prefix', () => {
    const items = [makeItem({ id: 'a', title: 'Bauhaus Poster' })];
    const index = buildSearchIndex(items, new Map(), new Map());
    expect(index.search('Bauhaus Post').map((r) => String(r.id))).toEqual(['a']);
  });

  it('tolerates one typo in words of 5+ letters', () => {
    const items = [makeItem({ id: 'a', title: 'Typography study' })];
    const index = buildSearchIndex(items, new Map(), new Map());
    expect(index.search('Typografy').map((r) => String(r.id))).toEqual(['a']);
  });

  it('boosts term names over title via the field weighting, matching vocabulary names', () => {
    const terms = new Map([['t1', makeTerm({ id: 't1', name: 'Dreamy' })]]);
    const itemTerms = new Map([['a', new Set(['t1'])]]);
    const items = [makeItem({ id: 'a', title: 'Untitled' })];
    const index = buildSearchIndex(items, itemTerms, terms);
    expect(index.search('Dreamy').map((r) => String(r.id))).toEqual(['a']);
  });

  it('excludes soft-deleted items', () => {
    const items = [makeItem({ id: 'a', title: 'Gone', deletedAt: '2026-02-01T00:00:00.000Z' })];
    const index = buildSearchIndex(items, new Map(), new Map());
    expect(index.search('Gone')).toEqual([]);
  });
});

describe('evaluateFilter', () => {
  it('unions within a field (OR) and intersects across fields (AND)', () => {
    const items = [
      makeItem({ id: 'a', kind: 'image', favorite: true }),
      makeItem({ id: 'b', kind: 'image', favorite: false }),
      makeItem({ id: 'c', kind: 'video', favorite: true }),
    ];
    const facets = buildFacetSets(items, new Map());
    const allIds = new Set(items.map((i) => i.id));

    const result = evaluateFilter(
      { kinds: ['image', 'video'], favorite: true },
      facets,
      allIds,
      null,
    );
    expect(result).toEqual(new Set(['a', 'c']));
  });

  it('subtracts excluded term ids', () => {
    const items = [makeItem({ id: 'a' }), makeItem({ id: 'b' })];
    const itemTerms = new Map([
      ['a', new Set(['v1'])],
      ['b', new Set(['v2'])],
    ]);
    const facets = buildFacetSets(items, itemTerms);
    const allIds = new Set(items.map((i) => i.id));

    const result = evaluateFilter({ exclude: { vibe: ['v1'] } }, facets, allIds, null);
    expect(result).toEqual(new Set(['b']));
  });

  it('intersects with text results when both text and filters are present', () => {
    const items = [makeItem({ id: 'a', favorite: true }), makeItem({ id: 'b', favorite: true })];
    const facets = buildFacetSets(items, new Map());
    const allIds = new Set(items.map((i) => i.id));

    const result = evaluateFilter({ favorite: true }, facets, allIds, new Set(['a']));
    expect(result).toEqual(new Set(['a']));
  });

  it('filters by the created-at date range', () => {
    const items = [
      makeItem({ id: 'a', createdAt: '2026-01-01T00:00:00.000Z' }),
      makeItem({ id: 'b', createdAt: '2026-06-01T00:00:00.000Z' }),
    ];
    const facets = buildFacetSets(items, new Map());
    const allIds = new Set(items.map((i) => i.id));

    const result = evaluateFilter(
      { added: { from: '2026-03-01T00:00:00.000Z' } },
      facets,
      allIds,
      null,
    );
    expect(result).toEqual(new Set(['b']));
  });

  it('with no clauses at all, returns every item', () => {
    const items = [makeItem({ id: 'a' }), makeItem({ id: 'b' })];
    const facets = buildFacetSets(items, new Map());
    const allIds = new Set(items.map((i) => i.id));
    expect(evaluateFilter({}, facets, allIds, null)).toEqual(allIds);
  });
});

describe('search', () => {
  it('combines text and facet filters end to end', () => {
    const terms = new Map([['t1', makeTerm({ id: 't1', facet: 'vibe', name: 'Dreamy' })]]);
    const itemTerms = new Map([['a', new Set(['t1'])]]);
    const items = [
      makeItem({ id: 'a', title: 'Poster', favorite: true }),
      makeItem({ id: 'b', title: 'Poster', favorite: false }),
    ];
    const index = buildSearchIndex(items, itemTerms, terms);

    const result = search(items, itemTerms, index, { text: 'Poster', favorite: true });
    expect(result).toEqual(new Set(['a']));
  });
});
