import { describe, expect, it } from 'vitest';
import { cardAlpha, connectionRelatedSet, type AlphaInputs } from './cardAlpha';

const base: AlphaInputs = {
  hoverHighlight: null,
  searchMatches: null,
  searchMode: 'dim',
  suppressConnectionDim: false,
};

describe('connectionRelatedSet', () => {
  it('is null when no source has a candidate, so nothing dims', () => {
    expect(connectionRelatedSet([])).toBeNull();
    expect(connectionRelatedSet([{ fromId: 'a', candidates: [] }])).toBeNull();
  });

  it('collects the sources and their candidates', () => {
    const related = connectionRelatedSet([{ fromId: 'a', candidates: [{ id: 'b' }, { id: 'c' }] }]);
    expect([...(related ?? [])].sort()).toEqual(['a', 'b', 'c']);
  });
});

describe('cardAlpha', () => {
  it('is 1 for everything when nothing is going on', () => {
    expect(cardAlpha('x', base, null)).toBe(1);
  });

  it('dims unrelated cards to 0.35 and keeps related ones bright', () => {
    const related = new Set(['a', 'b']);
    expect(cardAlpha('a', base, related)).toBe(1);
    expect(cardAlpha('z', base, related)).toBe(0.35);
  });

  it('does not dim for connections while dragging', () => {
    expect(cardAlpha('z', { ...base, suppressConnectionDim: true }, new Set(['a']))).toBe(1);
  });

  it('a group or hub highlight glows its members and dims the rest to 0.12', () => {
    const inputs = { ...base, hoverHighlight: new Set(['a']) };
    expect(cardAlpha('a', inputs, null)).toBe(1);
    expect(cardAlpha('z', inputs, null)).toBe(0.12);
  });

  it('dims search non-matches to 0.12 but leaves them at 1 in hide mode', () => {
    const dim = { ...base, searchMatches: new Set(['a']) };
    expect(cardAlpha('a', dim, null)).toBe(1);
    expect(cardAlpha('z', dim, null)).toBe(0.12);
    expect(cardAlpha('z', { ...dim, searchMode: 'hide' }, null)).toBe(1);
  });
});
