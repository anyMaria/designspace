import { describe, expect, it } from 'vitest';
import {
  buildConnectionIndex,
  computeHubs,
  formatHubLabel,
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

describe('computeHubs', () => {
  it('makes a hub for a value shared by 2+ visible items, not for a value only one item has', () => {
    const terms = new Map([['v1', makeTerm({ id: 'v1', facet: 'vibe', name: 'Dreamy' })]]);
    const itemTerms = new Map([
      ['a', new Set(['v1'])],
      ['b', new Set(['v1'])],
      ['c', new Set<string>()], // no vibe -> never a hub member
    ]);
    const items = [makeItem({ id: 'a' }), makeItem({ id: 'b' }), makeItem({ id: 'c' })];
    const index = buildConnectionIndex(items, itemTerms, terms, []);

    const { hubs, edgeCount, overLimit } = computeHubs(['a', 'b', 'c'], ['vibe'], index);
    expect(hubs).toHaveLength(1);
    expect(hubs[0].criterion).toBe('vibe');
    expect(hubs[0].value).toBe('v1');
    expect(hubs[0].itemIds.sort()).toEqual(['a', 'b']);
    expect(edgeCount).toBe(2);
    expect(overLimit).toBe(false);
  });

  it('excludes items outside the visible set from hub membership', () => {
    const terms = new Map([['v1', makeTerm({ id: 'v1' })]]);
    const itemTerms = new Map([
      ['a', new Set(['v1'])],
      ['b', new Set(['v1'])],
      ['c', new Set(['v1'])],
    ]);
    const items = [makeItem({ id: 'a' }), makeItem({ id: 'b' }), makeItem({ id: 'c' })];
    const index = buildConnectionIndex(items, itemTerms, terms, []);

    // Only 'a' and 'c' are visible (e.g. a search filter excludes 'b') -> still a hub, of 2.
    const { hubs } = computeHubs(['a', 'c'], ['vibe'], index);
    expect(hubs[0].itemIds.sort()).toEqual(['a', 'c']);
  });

  it('a manual "value" (the connected item id) forms a hub when 2+ items connect to the same one', () => {
    const items = [makeItem({ id: 'a' }), makeItem({ id: 'b' }), makeItem({ id: 'c' })];
    const index = buildConnectionIndex(items, new Map(), new Map(), [
      makeConnection({ id: 'c1', fromId: 'a', toId: 'c' }),
      makeConnection({ id: 'c2', fromId: 'b', toId: 'c' }),
    ]);
    const { hubs } = computeHubs(['a', 'b', 'c'], ['manual'], index);
    expect(hubs).toHaveLength(1);
    expect(hubs[0].criterion).toBe('manual');
    expect(hubs[0].value).toBe('c');
    expect(hubs[0].itemIds.sort()).toEqual(['a', 'b']);
  });

  it('reports overLimit once total edges exceed the 5,000-line cap', () => {
    const terms = new Map([['v1', makeTerm({ id: 'v1' })]]);
    const itemTerms = new Map<string, Set<string>>();
    const items: Item[] = [];
    const ids: string[] = [];
    for (let i = 0; i < 5001; i++) {
      const id = `i${i}`;
      ids.push(id);
      itemTerms.set(id, new Set(['v1']));
      items.push(makeItem({ id }));
    }
    const index = buildConnectionIndex(items, itemTerms, terms, []);
    const { overLimit, edgeCount } = computeHubs(ids, ['vibe'], index);
    expect(edgeCount).toBe(5001);
    expect(overLimit).toBe(true);
  });
});

describe('formatHubLabel', () => {
  it('resolves a facet hub to its term name', () => {
    const terms = new Map([['v1', makeTerm({ id: 'v1', facet: 'vibe', name: 'Dreamy' })]]);
    const hub = { criterion: 'vibe' as const, value: 'v1', itemIds: ['a', 'b'] };
    expect(formatHubLabel(hub, terms, new Map())).toBe('Dreamy');
  });

  it('uses the color family name directly', () => {
    const hub = { criterion: 'color' as const, value: 'orange', itemIds: ['a', 'b'] };
    expect(formatHubLabel(hub, new Map(), new Map())).toBe('orange');
  });

  it("resolves a manual hub to the connected item's own title", () => {
    const hub = { criterion: 'manual' as const, value: 'c', itemIds: ['a', 'b'] };
    const itemTitles = new Map([['c', 'Poster study']]);
    expect(formatHubLabel(hub, new Map(), itemTitles)).toBe('Poster study');
  });
});

describe("'similar' criterion", () => {
  function vec(...values: number[]): Float32Array {
    let sumSquares = 0;
    for (const v of values) sumSquares += v * v;
    const norm = Math.sqrt(sumSquares) || 1;
    return Float32Array.from(values.map((v) => v / norm));
  }

  it('scores an above-threshold neighbor and excludes a below-threshold one', () => {
    const embeddings = new Map([
      ['a', vec(1, 0, 0)],
      ['close', vec(0.99, 0.01, 0)], // cos ~0.9999, above SIMILAR_THRESHOLD (0.85)
      ['far', vec(0, 1, 0)], // cos 0, below
    ]);
    const items = [makeItem({ id: 'a' }), makeItem({ id: 'close' }), makeItem({ id: 'far' })];
    const index = buildConnectionIndex(items, new Map(), new Map(), [], embeddings);
    const candidates = scoreCandidates('a', ['similar'], index);
    const ids = candidates.map((c) => c.id);
    expect(ids).toContain('close');
    expect(ids).not.toContain('far');
  });

  it('never produces Show-all hubs', () => {
    const embeddings = new Map([
      ['a', vec(1, 0, 0)],
      ['b', vec(0.99, 0.01, 0)],
    ]);
    const items = [makeItem({ id: 'a' }), makeItem({ id: 'b' })];
    const index = buildConnectionIndex(items, new Map(), new Map(), [], embeddings);
    const { hubs } = computeHubs(['a', 'b'], ['similar'], index);
    expect(hubs).toEqual([]);
  });

  it('contributes nothing when no embeddings were passed to buildConnectionIndex', () => {
    const items = [makeItem({ id: 'a' }), makeItem({ id: 'b' })];
    const index = buildConnectionIndex(items, new Map(), new Map(), []);
    const candidates = scoreCandidates('a', ['similar'], index);
    expect(candidates).toEqual([]);
  });

  it('formats the shared tooltip with a percentage, not a term name', () => {
    const embeddings = new Map([
      ['a', vec(1, 0, 0)],
      ['b', vec(0.99, 0.01, 0)],
    ]);
    const items = [makeItem({ id: 'a' }), makeItem({ id: 'b' })];
    const index = buildConnectionIndex(items, new Map(), new Map(), [], embeddings);
    const candidates = scoreCandidates('a', ['similar'], index);
    const tooltip = formatSharedTooltip(candidates[0].shared, new Map(), {
      type: 'Type',
      vibe: 'Vibe',
      movement: 'Movement',
      tag: 'Tags',
      color: 'Color',
      manual: 'My connections',
      similar: 'Similar look',
    });
    expect(tooltip).toMatch(/Similar look: \d+%/);
  });
});
