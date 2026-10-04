import { describe, expect, it } from 'vitest';
import { computeConstellationLayout, hashSeed, mulberry32 } from './constellations';
import { buildConnectionIndex } from './connections';
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

describe('mulberry32', () => {
  it('is deterministic for the same seed', () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    const seqA = [a(), a(), a()];
    const seqB = [b(), b(), b()];
    expect(seqA).toEqual(seqB);
  });

  it('produces different sequences for different seeds', () => {
    const a = mulberry32(1)();
    const b = mulberry32(2)();
    expect(a).not.toBe(b);
  });

  it('always returns values in [0, 1)', () => {
    const r = mulberry32(123);
    for (let i = 0; i < 50; i++) {
      const v = r();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe('hashSeed', () => {
  it('is deterministic for the same parts', () => {
    expect(hashSeed(['vibe', 'tag', 'a', 'b'])).toBe(hashSeed(['vibe', 'tag', 'a', 'b']));
  });

  it('differs when the parts differ, including across the join boundary', () => {
    expect(hashSeed(['ab', 'c'])).not.toBe(hashSeed(['a', 'bc']));
    expect(hashSeed(['vibe'])).not.toBe(hashSeed(['tag']));
  });
});

describe('computeConstellationLayout', () => {
  function setup() {
    const terms = new Map([
      ['v1', makeTerm({ id: 'v1', facet: 'vibe', name: 'Dreamy' })],
      ['v2', makeTerm({ id: 'v2', facet: 'vibe', name: 'Bold' })],
    ]);
    const itemTerms = new Map([
      ['a', new Set(['v1'])],
      ['b', new Set(['v1'])],
      ['c', new Set(['v1'])],
      ['d', new Set(['v2'])], // alone in its own hub value -> no hub (needs 2+)
      ['e', new Set<string>()], // no value at all -> unclassified
    ]);
    const items = ['a', 'b', 'c', 'd', 'e'].map((id) => makeItem({ id }));
    const index = buildConnectionIndex(items, itemTerms, terms, []);
    const itemTitles = new Map(items.map((i) => [i.id, i.title]));
    return { terms, itemTerms, items, index, itemTitles };
  }

  it('is deterministic: the same inputs always give the same layout', () => {
    const { index, terms, itemTitles } = setup();
    const ids = ['a', 'b', 'c', 'd', 'e'];
    const layout1 = computeConstellationLayout(ids, ['vibe'], index, terms, itemTitles);
    const layout2 = computeConstellationLayout(ids, ['vibe'], index, terms, itemTitles);
    expect([...layout1.itemPositions]).toEqual([...layout2.itemPositions]);
    expect(layout1.hubs).toEqual(layout2.hubs);
    expect(layout1.unclassifiedIds).toEqual(layout2.unclassifiedIds);
  });

  it('a bigger spacing puts members further from their star', () => {
    const ids = Array.from({ length: 20 }, (_, i) => `i${i}`);
    const items = ids.map((id) => makeItem({ id }));
    const terms = new Map([['v1', makeTerm({ id: 'v1', facet: 'vibe', name: 'Dreamy' })]]);
    const itemTerms = new Map(ids.map((id) => [id, new Set(['v1'])]));
    const index = buildConnectionIndex(items, itemTerms, terms, []);
    const titles = new Map(items.map((i) => [i.id, i.title]));
    const meanDistance = (spacing: number): number => {
      const layout = computeConstellationLayout(ids, ['vibe'], index, terms, titles, { spacing });
      const hub = layout.hubs[0];
      const total = ids.reduce((sum, id) => {
        const p = layout.itemPositions.get(id)!;
        return sum + Math.hypot(p.x - hub.x, p.y - hub.y);
      }, 0);
      return total / ids.length;
    };
    expect(meanDistance(2)).toBeGreaterThan(meanDistance(1));
  });

  it('gives a different layout for a different active-criteria set (part of the seed)', () => {
    const { index, terms, itemTerms, items } = setup();
    const itemTitles = new Map(items.map((i) => [i.id, i.title]));
    const colorIndex = buildConnectionIndex(items, itemTerms, terms, []);
    const ids = ['a', 'b', 'c', 'd', 'e'];
    const layoutVibe = computeConstellationLayout(ids, ['vibe'], index, terms, itemTitles);
    const layoutColor = computeConstellationLayout(ids, ['color'], colorIndex, terms, itemTitles);
    expect(layoutVibe.itemPositions.get('a')).not.toEqual(layoutColor.itemPositions.get('a'));
  });

  it('only forms a hub for a value shared by 2+ items, and places every item somewhere', () => {
    const { index, terms, itemTitles } = setup();
    const ids = ['a', 'b', 'c', 'd', 'e'];
    const layout = computeConstellationLayout(ids, ['vibe'], index, terms, itemTitles);

    expect(layout.hubs).toHaveLength(1);
    expect(layout.hubs[0].value).toBe('v1');
    expect(layout.hubs[0].label).toBe('Dreamy');
    expect(layout.hubs[0].itemIds.sort()).toEqual(['a', 'b', 'c']);

    for (const id of ids) expect(layout.itemPositions.has(id)).toBe(true);
  });

  it('puts items with no value for the active criteria in unclassifiedIds', () => {
    const { index, terms, itemTitles } = setup();
    const ids = ['a', 'b', 'c', 'd', 'e'];
    const layout = computeConstellationLayout(ids, ['vibe'], index, terms, itemTitles);
    expect(layout.unclassifiedIds).toEqual(['d', 'e']);
  });

  it('places unclassified items further from the origin than any hub', () => {
    const { index, terms, itemTitles } = setup();
    const ids = ['a', 'b', 'c', 'd', 'e'];
    const layout = computeConstellationLayout(ids, ['vibe'], index, terms, itemTitles);
    const hubDist = Math.hypot(layout.hubs[0].x, layout.hubs[0].y);
    for (const id of layout.unclassifiedIds) {
      const p = layout.itemPositions.get(id)!;
      expect(Math.hypot(p.x, p.y)).toBeGreaterThan(hubDist);
    }
  });

  it('with no hubs at all, every item is unclassified and layout still completes', () => {
    const items = ['a', 'b'].map((id) => makeItem({ id }));
    const index = buildConnectionIndex(items, new Map(), new Map(), []);
    const itemTitles = new Map(items.map((i) => [i.id, i.title]));
    const layout = computeConstellationLayout(['a', 'b'], ['vibe'], index, new Map(), itemTitles);
    expect(layout.hubs).toEqual([]);
    expect(layout.unclassifiedIds.sort()).toEqual(['a', 'b']);
    expect(layout.itemPositions.size).toBe(2);
  });

  it("a manual connection hub resolves its label to the connected item's own title", () => {
    const items = [
      makeItem({ id: 'a', title: 'Poster A' }),
      makeItem({ id: 'b', title: 'Poster B' }),
      makeItem({ id: 'c', title: 'Target' }),
    ];
    const manualConnections: ManualConnection[] = [
      { id: 'c1', fromId: 'a', toId: 'c', label: null, createdAt: '2026-01-01T00:00:00.000Z' },
      { id: 'c2', fromId: 'b', toId: 'c', label: null, createdAt: '2026-01-01T00:00:00.000Z' },
    ];
    const index = buildConnectionIndex(items, new Map(), new Map(), manualConnections);
    const itemTitles = new Map(items.map((i) => [i.id, i.title]));
    const layout = computeConstellationLayout(
      ['a', 'b', 'c'],
      ['manual'],
      index,
      new Map(),
      itemTitles,
    );
    expect(layout.hubs).toHaveLength(1);
    expect(layout.hubs[0].label).toBe('Target');
  });
});
