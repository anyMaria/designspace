import { describe, expect, it } from 'vitest';
import {
  buildConnectionIndex,
  formatSharedTooltip,
  scoreCandidates,
  restrictToSelection,
} from './connections';
import type { Criterion } from './connections';
import type { Item, ManualConnection, Term } from '@/state/types';

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

function makeConnection(overrides: Partial<ManualConnection> = {}): ManualConnection {
  return {
    id: 'c1',
    fromId: 'a',
    toId: 'b',
    label: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('buildConnectionIndex + scoreCandidates', () => {
  it('scores by the number of shared values across active criteria', () => {
    const terms = new Map([
      ['v1', makeTerm({ id: 'v1', facet: 'vibe', name: 'Dreamy' })],
      ['tag1', makeTerm({ id: 'tag1', facet: 'tag', name: 'grain' })],
    ]);
    const itemTerms = new Map([
      ['a', new Set(['v1', 'tag1'])],
      ['b', new Set(['v1', 'tag1'])], // shares both -> score 2
      ['c', new Set(['v1'])], // shares one -> score 1
    ]);
    const items = [makeItem({ id: 'a' }), makeItem({ id: 'b' }), makeItem({ id: 'c' })];
    const index = buildConnectionIndex(items, itemTerms, terms, []);

    const candidates = scoreCandidates('a', ['vibe', 'tag'], index);
    expect(candidates.find((c) => c.id === 'b')?.score).toBe(2);
    expect(candidates.find((c) => c.id === 'c')?.score).toBe(1);
  });

  it('reports which values were shared, per criterion, for the tooltip', () => {
    const terms = new Map([['v1', makeTerm({ id: 'v1', facet: 'vibe', name: 'Dreamy' })]]);
    const itemTerms = new Map([
      ['a', new Set(['v1'])],
      ['b', new Set(['v1'])],
    ]);
    const items = [makeItem({ id: 'a' }), makeItem({ id: 'b' })];
    const index = buildConnectionIndex(items, itemTerms, terms, []);

    const candidates = scoreCandidates('a', ['vibe'], index);
    expect(candidates[0].shared).toEqual({ vibe: ['v1'] });
  });

  it('a manual connection contributes to the score like any shared value', () => {
    const items = [makeItem({ id: 'a' }), makeItem({ id: 'b' })];
    const index = buildConnectionIndex(items, new Map(), new Map(), [
      makeConnection({ fromId: 'a', toId: 'b' }),
    ]);

    const candidates = scoreCandidates('a', ['manual'], index);
    expect(candidates).toEqual([{ id: 'b', score: 1, shared: { manual: ['b'] } }]);
  });

  it('color uses the precomputed colorFamilies list', () => {
    const items = [
      makeItem({ id: 'a', colorFamilies: ['orange'] }),
      makeItem({ id: 'b', colorFamilies: ['orange', 'blue'] }),
    ];
    const index = buildConnectionIndex(items, new Map(), new Map(), []);
    const candidates = scoreCandidates('a', ['color'], index);
    expect(candidates[0]).toMatchObject({ id: 'b', score: 1 });
  });

  it('drops candidates below minStrength', () => {
    const terms = new Map([['v1', makeTerm({ id: 'v1' })]]);
    const itemTerms = new Map([
      ['a', new Set(['v1'])],
      ['b', new Set(['v1'])],
    ]);
    const items = [makeItem({ id: 'a' }), makeItem({ id: 'b' })];
    const index = buildConnectionIndex(items, itemTerms, terms, []);
    expect(scoreCandidates('a', ['vibe'], index, 2)).toEqual([]);
  });

  it('sorts by score descending, ties broken by newest', () => {
    const terms = new Map([['v1', makeTerm({ id: 'v1' })]]);
    const itemTerms = new Map([
      ['a', new Set(['v1'])],
      ['b', new Set(['v1'])],
      ['c', new Set(['v1'])],
    ]);
    const items = [
      makeItem({ id: 'a', createdAt: '2026-01-01T00:00:00.000Z' }),
      makeItem({ id: 'b', createdAt: '2026-01-01T00:00:00.000Z' }),
      makeItem({ id: 'c', createdAt: '2026-06-01T00:00:00.000Z' }),
    ];
    const index = buildConnectionIndex(items, itemTerms, terms, []);
    const candidates = scoreCandidates('a', ['vibe'], index);
    expect(candidates.map((c) => c.id)).toEqual(['c', 'b']); // c is newer, same score as b
  });

  it('caps results to the top 40', () => {
    const terms = new Map([['v1', makeTerm({ id: 'v1' })]]);
    const itemTerms = new Map<string, Set<string>>();
    const items: Item[] = [];
    for (let i = 0; i < 50; i++) {
      const id = `i${i}`;
      itemTerms.set(id, new Set(['v1']));
      items.push(makeItem({ id, createdAt: new Date(2026, 0, 1 + i).toISOString() }));
    }
    const index = buildConnectionIndex(items, itemTerms, terms, []);
    expect(scoreCandidates('i0', ['vibe'], index)).toHaveLength(40);
  });

  it('excludes soft-deleted items from the index', () => {
    const terms = new Map([['v1', makeTerm({ id: 'v1' })]]);
    const itemTerms = new Map([
      ['a', new Set(['v1'])],
      ['b', new Set(['v1'])],
    ]);
    const items = [
      makeItem({ id: 'a' }),
      makeItem({ id: 'b', deletedAt: '2026-02-01T00:00:00.000Z' }),
    ];
    const index = buildConnectionIndex(items, itemTerms, terms, []);
    expect(scoreCandidates('a', ['vibe'], index)).toEqual([]);
  });

  it('`similar` never contributes (deferred to M6)', () => {
    const items = [makeItem({ id: 'a' }), makeItem({ id: 'b' })];
    const index = buildConnectionIndex(items, new Map(), new Map(), []);
    expect(scoreCandidates('a', ['similar'], index)).toEqual([]);
  });
});

describe('restrictToSelection', () => {
  it('keeps only candidates that are also in the selection', () => {
    const candidates = [
      { id: 'a', score: 2, shared: {} },
      { id: 'b', score: 1, shared: {} },
    ];
    expect(restrictToSelection(candidates, new Set(['a']))).toEqual([candidates[0]]);
  });
});

describe('formatSharedTooltip', () => {
  const labels: Record<Criterion, string> = {
    type: 'Type',
    vibe: 'Vibe',
    movement: 'Movement',
    tag: 'Tags',
    color: 'Color',
    manual: 'My connections',
    similar: 'Similar look',
  };

  it('resolves facet term ids to names and joins multiple criteria', () => {
    const terms = new Map([
      ['v1', makeTerm({ id: 'v1', facet: 'vibe', name: 'Dreamy' })],
      ['tag1', makeTerm({ id: 'tag1', facet: 'tag', name: 'serif' })],
      ['tag2', makeTerm({ id: 'tag2', facet: 'tag', name: 'grain' })],
    ]);
    const text = formatSharedTooltip({ vibe: ['v1'], tag: ['tag1', 'tag2'] }, terms, labels);
    expect(text).toBe('Vibe: Dreamy · Tags: serif, grain');
  });

  it('uses color family names directly, without a term lookup', () => {
    const text = formatSharedTooltip({ color: ['orange'] }, new Map(), labels);
    expect(text).toBe('Color: orange');
  });

  it('shows just the label for a manual connection, no values', () => {
    const text = formatSharedTooltip({ manual: ['other-item-id'] }, new Map(), labels);
    expect(text).toBe('My connections');
  });
});
