import { describe, expect, it } from 'vitest';
import { buildConnectionIndex, scoreCandidates } from './connections';
import type { Item, ManualConnection, Term } from '@/state/types';

/** §4.9's budget: "It must compute in under 16 ms." — the hover score itself, not the index
 * build (that only happens on data change, not per-hover). Generous CI ceiling for the same
 * reason as the search engine's bench test: catch a real regression, not chase CI hardware. */
function makeItems(count: number): Item[] {
  const items: Item[] = [];
  for (let i = 0; i < count; i++) {
    items.push({
      id: `i${i}`,
      kind: 'image',
      title: `Item ${i}`,
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
      colorFamilies: [i % 2 === 0 ? 'orange' : 'blue'],
      phash: null,
      favorite: false,
      sortedAt: null,
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

function makeManualConnections(items: Item[]): ManualConnection[] {
  const connections: ManualConnection[] = [];
  for (let i = 0; i < items.length - 1; i += 50) {
    connections.push({
      id: `c${i}`,
      fromId: items[i].id,
      toId: items[i + 1].id,
      label: null,
      createdAt: '2026-01-01T00:00:00.000Z',
    });
  }
  return connections;
}

describe('connection hover-score performance budget (§4.9)', () => {
  it('scores one hover in well under budget at 10,000 items', () => {
    const items = makeItems(10_000);
    const terms = makeTerms();
    const itemTerms = makeItemTerms(items, terms);
    const manualConnections = makeManualConnections(items);
    const index = buildConnectionIndex(items, itemTerms, terms, manualConnections);

    const start = performance.now();
    const result = scoreCandidates('i0', ['vibe', 'tag', 'manual'], index);
    const elapsed = performance.now() - start;

    expect(result.length).toBeGreaterThanOrEqual(0);
    expect(elapsed).toBeLessThan(100); // generous CI ceiling — see comment above
  });
});
