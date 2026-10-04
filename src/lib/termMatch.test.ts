import { describe, expect, it } from 'vitest';
import { editDistance, matchTerms, type TermOption } from './termMatch';

const opts: TermOption[] = [
  { id: '1', name: 'Dreamy', count: 12 },
  { id: '2', name: 'Dramatic', count: 3 },
  { id: '3', name: 'Dark', count: 7 },
  { id: '4', name: 'Minimal', count: 2 },
  { id: '5', name: 'Rêveur', count: 1 },
  { id: '6', name: 'Art Nouveau', count: 4 },
  { id: '7', name: 'Swiss Style', count: 0 },
];

describe('editDistance', () => {
  it('counts insertions, deletions, substitutions and swaps as 1', () => {
    expect(editDistance('dreamy', 'dreamy')).toBe(0);
    expect(editDistance('dremy', 'dreamy')).toBe(1);
    expect(editDistance('dreamey', 'dreamy')).toBe(1);
    expect(editDistance('draemy', 'dreamy')).toBe(1);
    expect(editDistance('cat', 'dog')).toBe(3);
  });
});

describe('matchTerms', () => {
  it('lists everything not already chosen, most used first, when empty', () => {
    const r = matchTerms('', opts, ['Dark']);
    expect(r.matches.map((o) => o.name)).toEqual([
      'Dreamy',
      'Art Nouveau',
      'Dramatic',
      'Minimal',
      'Rêveur',
      'Swiss Style',
    ]);
    expect(r.canCreate).toBe(false);
  });
  it('puts starts-with before contains, most used first inside a group', () => {
    const r = matchTerms('dr', opts, []);
    expect(r.matches.map((o) => o.name)).toEqual(['Dreamy', 'Dramatic']);
  });
  it('matches a word inside the name', () => {
    expect(matchTerms('nouv', opts, []).matches.map((o) => o.name)).toEqual(['Art Nouveau']);
    expect(matchTerms('style', opts, []).matches.map((o) => o.name)).toEqual(['Swiss Style']);
  });
  it('ignores case and accents', () => {
    const r = matchTerms('REVEUR', opts, []);
    expect(r.exact?.name).toBe('Rêveur');
    expect(r.canCreate).toBe(false);
  });
  it('forgives one typo from 4 letters and suggests the value', () => {
    const r = matchTerms('dremy', opts, []);
    expect(r.matches[0].name).toBe('Dreamy');
    expect(r.didYouMean?.name).toBe('Dreamy');
    expect(r.canCreate).toBe(true);
  });
  it('matches a typo while the word is still being typed', () => {
    expect(matchTerms('minm', opts, []).matches.map((o) => o.name)).toEqual(['Minimal']);
  });
  it('does not guess under 4 letters', () => {
    const r = matchTerms('drk', opts, []);
    expect(r.matches).toEqual([]);
    expect(r.didYouMean).toBeNull();
    expect(r.canCreate).toBe(true);
  });
  it('offers to create a genuinely new value', () => {
    const r = matchTerms('grain', opts, []);
    expect(r.matches).toEqual([]);
    expect(r.canCreate).toBe(true);
    expect(r.didYouMean).toBeNull();
  });
  it('reports an exact match that is already on the item without listing it', () => {
    const r = matchTerms('dark', opts, ['Dark']);
    expect(r.exact?.name).toBe('Dark');
    expect(r.matches.map((o) => o.name)).not.toContain('Dark');
    expect(r.canCreate).toBe(false);
  });
  it('caps the list', () => {
    expect(matchTerms('', opts, [], 3).matches).toHaveLength(3);
  });
});
