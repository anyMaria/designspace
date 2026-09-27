import { describe, expect, it } from 'vitest';
import { groupItems, sortItems } from './listGrouping';
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
    sortedAt: null,
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

describe('groupItems', () => {
  it('groupBy none returns a single group with every item', () => {
    const items = [makeItem({ id: 'a' }), makeItem({ id: 'b' })];
    const groups = groupItems(items, 'none', new Map(), new Map());
    expect(groups).toHaveLength(1);
    expect(groups[0].itemIds).toEqual(['a', 'b']);
  });

  it('an item with several values for the facet appears in each of its groups', () => {
    const terms = new Map([
      ['v1', makeTerm({ id: 'v1', name: 'Dreamy' })],
      ['v2', makeTerm({ id: 'v2', name: 'Bold' })],
    ]);
    const itemTerms = new Map([['a', new Set(['v1', 'v2'])]]);
    const items = [makeItem({ id: 'a' })];
    const groups = groupItems(items, 'vibe', itemTerms, terms);
    expect(groups.map((g) => g.label).sort()).toEqual(['Bold', 'Dreamy']);
    expect(groups.every((g) => g.itemIds.includes('a'))).toBe(true);
  });

  it('items with no value land in a "No X" group, sorted last', () => {
    const terms = new Map([['v1', makeTerm({ id: 'v1', name: 'Dreamy' })]]);
    const itemTerms = new Map([['a', new Set(['v1'])]]);
    const items = [makeItem({ id: 'a' }), makeItem({ id: 'b' })];
    const groups = groupItems(items, 'vibe', itemTerms, terms);
    expect(groups.at(-1)).toMatchObject({ key: '__none__', label: 'No vibe', itemIds: ['b'] });
  });

  it('empty groups never appear', () => {
    const items = [makeItem({ id: 'a' })];
    const groups = groupItems(items, 'vibe', new Map(), new Map());
    // Only the "No vibe" bucket (item a has no vibe) — no empty facet-value groups exist at all.
    expect(groups).toHaveLength(1);
    expect(groups[0].key).toBe('__none__');
  });

  it('groups by kind', () => {
    const items = [makeItem({ id: 'a', kind: 'image' }), makeItem({ id: 'b', kind: 'video' })];
    const groups = groupItems(items, 'kind', new Map(), new Map());
    expect(groups.map((g) => g.key).sort()).toEqual(['image', 'video']);
  });

  it('groups by color using the precomputed colorFamilies list', () => {
    const items = [
      makeItem({ id: 'a', colorFamilies: ['orange', 'blue'] }),
      makeItem({ id: 'b', colorFamilies: [] }),
    ];
    const groups = groupItems(items, 'color', new Map(), new Map());
    expect(groups.find((g) => g.key === 'orange')?.itemIds).toEqual(['a']);
    expect(groups.find((g) => g.key === 'blue')?.itemIds).toEqual(['a']);
    expect(groups.find((g) => g.key === '__none__')?.itemIds).toEqual(['b']);
  });

  it('groups by month using the created-at date', () => {
    const items = [
      makeItem({ id: 'a', createdAt: '2026-01-15T00:00:00.000Z' }),
      makeItem({ id: 'b', createdAt: '2026-01-20T00:00:00.000Z' }),
      makeItem({ id: 'c', createdAt: '2026-02-01T00:00:00.000Z' }),
    ];
    const groups = groupItems(items, 'month', new Map(), new Map());
    expect(groups.find((g) => g.key === '2026-01')?.itemIds).toEqual(['a', 'b']);
    expect(groups.find((g) => g.key === '2026-02')?.itemIds).toEqual(['c']);
  });
});

describe('sortItems', () => {
  it('sorts newest first by createdAt', () => {
    const items = new Map([
      ['a', makeItem({ id: 'a', createdAt: '2026-01-01T00:00:00.000Z' })],
      ['b', makeItem({ id: 'b', createdAt: '2026-06-01T00:00:00.000Z' })],
    ]);
    expect(sortItems(['a', 'b'], 'newest', items)).toEqual(['b', 'a']);
  });

  it('sorts oldest first by createdAt', () => {
    const items = new Map([
      ['a', makeItem({ id: 'a', createdAt: '2026-01-01T00:00:00.000Z' })],
      ['b', makeItem({ id: 'b', createdAt: '2026-06-01T00:00:00.000Z' })],
    ]);
    expect(sortItems(['a', 'b'], 'oldest', items)).toEqual(['a', 'b']);
  });

  it('sorts title A-Z', () => {
    const items = new Map([
      ['a', makeItem({ id: 'a', title: 'Zebra' })],
      ['b', makeItem({ id: 'b', title: 'Apple' })],
    ]);
    expect(sortItems(['a', 'b'], 'title', items)).toEqual(['b', 'a']);
  });
});
