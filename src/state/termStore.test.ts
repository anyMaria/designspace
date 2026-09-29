import { beforeEach, describe, expect, it } from 'vitest';
import { useTermStore } from './termStore';
import type { ItemTerm, Term } from './types';

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

beforeEach(() => {
  useTermStore.setState({ terms: new Map(), itemTerms: new Map() });
});

describe('termStore', () => {
  it('loadAll indexes item_terms by item id', () => {
    const terms = [makeTerm({ id: 't1' }), makeTerm({ id: 't2', name: 'Bold' })];
    const itemTerms: ItemTerm[] = [
      { itemId: 'i1', termId: 't1', via: 'user', addedAt: '2026-01-01' },
      { itemId: 'i1', termId: 't2', via: 'user', addedAt: '2026-01-01' },
      { itemId: 'i2', termId: 't1', via: 'ai', addedAt: '2026-01-01' },
    ];
    useTermStore.getState().loadAll(terms, itemTerms);

    expect(useTermStore.getState().terms.size).toBe(2);
    expect(useTermStore.getState().itemTerms.get('i1')).toEqual(new Set(['t1', 't2']));
    expect(useTermStore.getState().itemTerms.get('i2')).toEqual(new Set(['t1']));
  });

  it('addItemTerm/removeItemTerm mutate one item without touching others', () => {
    useTermStore.getState().upsertTerm(makeTerm());
    useTermStore.getState().addItemTerm('i1', 't1');
    expect(useTermStore.getState().itemTerms.get('i1')).toEqual(new Set(['t1']));

    useTermStore.getState().removeItemTerm('i1', 't1');
    expect(useTermStore.getState().itemTerms.get('i1')).toEqual(new Set());
  });

  it('removeTerms deletes the term and scrubs it from every item', () => {
    useTermStore
      .getState()
      .upsertTerms([makeTerm({ id: 't1' }), makeTerm({ id: 't2', name: 'Bold' })]);
    useTermStore.getState().addItemTerm('i1', 't1');
    useTermStore.getState().addItemTerm('i1', 't2');

    useTermStore.getState().removeTerms(['t1']);

    expect(useTermStore.getState().terms.has('t1')).toBe(false);
    expect(useTermStore.getState().itemTerms.get('i1')).toEqual(new Set(['t2']));
  });

  it('itemTermIdsForFacet filters to one facet', () => {
    useTermStore
      .getState()
      .upsertTerms([
        makeTerm({ id: 't1', facet: 'vibe' }),
        makeTerm({ id: 't2', facet: 'type', name: 'Poster' }),
      ]);
    useTermStore.getState().addItemTerm('i1', 't1');
    useTermStore.getState().addItemTerm('i1', 't2');

    expect(useTermStore.getState().itemTermIdsForFacet('i1', 'vibe')).toEqual(['t1']);
    expect(useTermStore.getState().itemTermIdsForFacet('i1', 'type')).toEqual(['t2']);
    expect(useTermStore.getState().itemTermIdsForFacet('i2', 'vibe')).toEqual([]);
  });
});
