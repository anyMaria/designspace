import { describe, expect, it } from 'vitest';
import { buildSearchIndex, search } from './search';
import type { Item, Term } from '@/state/types';

/** §4.8's budget: "≤ 30 ms per keystroke at 10,000 items". This runs the actual search path
 * (index built once, then one query — the per-keystroke cost) against a synthetic 10k-item
 * library. CI hardware varies, so the assertion is a generous multiple of the spec's number
 * rather than 30ms itself, to catch a real algorithmic regression (e.g. an accidental O(n²))
 * without flaking on a slow runner; the owner's own machine is where the tight 30ms number is
 * meaningful. */
function makeItems(count: number): Item[] {
  const words = [
    'Poster',
    'Bauhaus',
    'Memphis',
    'Dreamy',
    'Nostalgic',
    'Vintage',
    'Minimal',
    'Bold',
  ];
  const items: Item[] = [];
  for (let i = 0; i < count; i++) {
    items.push({
      id: `i${i}`,
      kind: 'image',
      title: `${words[i % words.length]} ${i}`,
      filePath: `media/${i}.jpg`,
      fileName: `${i}.jpg`,
      fileHash: `hash${i}`,
      fileSize: 1000,
      mime: 'image/jpeg',
      width: 320,
      height: 400,
      artist: i % 5 === 0 ? `Artist ${i % 50}` : null,
      sourceUrl: null,
      why: null,
      palette: null,
      colorFamilies: i % 2 === 0 ? ['orange'] : ['blue'],
      phash: null,
      favorite: i % 10 === 0,
      sortedAt: i % 3 === 0 ? null : '2026-01-01T00:00:00.000Z',
      viewedAt: null,
      status: 'ok',
      derivedV: 1,
      createdAt: new Date(2026, 0, 1 + (i % 300)).toISOString(),
      updatedAt: '2026-01-01T00:00:00.000Z',
      deletedAt: null,
    });
  }
  return items;
}

function makeTerms(): Map<string, Term> {
  const facets = ['type', 'vibe', 'movement', 'tag'] as const;
  const terms = new Map<string, Term>();
  let i = 0;
  for (const facet of facets) {
    for (let j = 0; j < 20; j++) {
      const id = `t${i++}`;
      terms.set(id, {
        id,
        facet,
        name: `${facet}-${j}`,
        nameNorm: `${facet}-${j}`,
        aiHint: null,
        sort: j,
        createdAt: '2026-01-01T00:00:00.000Z',
      });
    }
  }
  return terms;
}

function makeItemTerms(items: Item[], terms: Map<string, Term>): Map<string, Set<string>> {
  const termIds = [...terms.keys()];
  const itemTerms = new Map<string, Set<string>>();
  for (const item of items) {
    const picked = new Set<string>();
    for (let k = 0; k < 3; k++)
      picked.add(termIds[(item.id.charCodeAt(1) + k * 7) % termIds.length]);
    itemTerms.set(item.id, picked);
  }
  return itemTerms;
}

describe('search performance budget (§4.8)', () => {
  it('runs a combined text + facet query in well under budget at 10,000 items', () => {
    const items = makeItems(10_000);
    const terms = makeTerms();
    const itemTerms = makeItemTerms(items, terms);
    const index = buildSearchIndex(items, itemTerms, terms);

    const start = performance.now();
    const result = search(items, itemTerms, index, {
      text: 'Poster',
      favorite: true,
      include: { vibe: ['t20'] },
    });
    const elapsed = performance.now() - start;

    expect(result.size).toBeGreaterThanOrEqual(0);
    expect(elapsed).toBeLessThan(150); // generous CI ceiling — see comment above
  });

  it('builds the whole index for 10,000 items in a reasonable time', () => {
    const items = makeItems(10_000);
    const terms = makeTerms();
    const itemTerms = makeItemTerms(items, terms);

    const start = performance.now();
    buildSearchIndex(items, itemTerms, terms);
    const elapsed = performance.now() - start;

    expect(elapsed).toBeLessThan(500);
  });
});
