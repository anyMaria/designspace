import { describe, expect, it } from 'vitest';
import { buildConnectionIndex } from './connections';
import { computeConstellationLayout } from './constellations';
import type { Item, ManualConnection, Term } from '@/state/types';

/** §4.9's budget: "≤ 1.5 s for 3,000 items and ≤ 5 s for 10,000." Generous CI ceiling for the
 * same reason as the search/connections bench tests: catch a real regression, not chase CI
 * hardware — the worker wrapper (`layout.worker.ts`) is what actually keeps this off the main
 * thread; this measures the algorithm itself. */
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
      colorFamilies: null,
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

/** A handful of distinct values per facet (not one value per item), so hubs actually form —
 * the realistic shape of a classified library, unlike a pathological all-distinct or all-same
 * input. */
function makeTerms(): Map<string, Term> {
  const facets = ['type', 'vibe', 'movement', 'tag'] as const;
  const terms = new Map<string, Term>();
  let i = 0;
  for (const facet of facets) {
    for (let j = 0; j < 25; j++) {
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
      picked.add(termIds[(item.id.charCodeAt(1) * 7 + k * 13) % termIds.length]);
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

describe('Constellations layout performance budget (§4.9)', () => {
  it('lays out 3,000 items well under budget', () => {
    const items = makeItems(3000);
    const terms = makeTerms();
    const itemTerms = makeItemTerms(items, terms);
    const manualConnections = makeManualConnections(items);
    const index = buildConnectionIndex(items, itemTerms, terms, manualConnections);
    const itemTitles = new Map(items.map((i) => [i.id, i.title]));
    const ids = items.map((i) => i.id);

    const start = performance.now();
    const layout = computeConstellationLayout(
      ids,
      ['vibe', 'tag', 'manual'],
      index,
      terms,
      itemTitles,
    );
    const elapsed = performance.now() - start;

    expect(layout.itemPositions.size).toBe(3000);
    expect(elapsed).toBeLessThan(6000); // plan: ≤1.5s — generous CI ceiling, see comment above
  });
});
