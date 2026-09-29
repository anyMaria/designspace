import { beforeEach, describe, expect, it } from 'vitest';
import { useSearchStore, isFilterActive } from './searchStore';

beforeEach(() => {
  useSearchStore.setState({ isOpen: false, filter: {}, dimHideMode: 'dim' });
});

describe('useSearchStore', () => {
  it('closeOrClearText clears the text first, then closes on a second call', () => {
    useSearchStore.getState().open();
    useSearchStore.getState().setText('poster');
    useSearchStore.getState().closeOrClearText();
    expect(useSearchStore.getState().filter.text).toBeUndefined();
    expect(useSearchStore.getState().isOpen).toBe(true);

    useSearchStore.getState().closeOrClearText();
    expect(useSearchStore.getState().isOpen).toBe(false);
  });

  it('toggleTerm includes a term (OR within the facet), and toggling again clears it', () => {
    useSearchStore.getState().toggleTerm('vibe', 'v1', false);
    expect(useSearchStore.getState().filter.include).toEqual({ vibe: ['v1'] });
    useSearchStore.getState().toggleTerm('vibe', 'v2', false);
    expect(useSearchStore.getState().filter.include).toEqual({ vibe: ['v1', 'v2'] });
    useSearchStore.getState().toggleTerm('vibe', 'v1', false);
    expect(useSearchStore.getState().filter.include).toEqual({ vibe: ['v2'] });
  });

  it('alt-click (exclude) moves a term out of include and into exclude', () => {
    useSearchStore.getState().toggleTerm('vibe', 'v1', false);
    useSearchStore.getState().toggleTerm('vibe', 'v1', true);
    expect(useSearchStore.getState().filter.include).toBeUndefined();
    expect(useSearchStore.getState().filter.exclude).toEqual({ vibe: ['v1'] });
  });

  it('toggling an excluded term again clears it from exclude', () => {
    useSearchStore.getState().toggleTerm('vibe', 'v1', true);
    useSearchStore.getState().toggleTerm('vibe', 'v1', true);
    expect(useSearchStore.getState().filter.exclude).toBeUndefined();
  });

  it('toggleFavorite/toggleInbox flip booleans on and off', () => {
    useSearchStore.getState().toggleFavorite();
    expect(useSearchStore.getState().filter.favorite).toBe(true);
    useSearchStore.getState().toggleFavorite();
    expect(useSearchStore.getState().filter.favorite).toBeUndefined();
  });

  it('clearFilter resets the whole filter', () => {
    useSearchStore.getState().setText('x');
    useSearchStore.getState().toggleFavorite();
    useSearchStore.getState().clearFilter();
    expect(useSearchStore.getState().filter).toEqual({});
  });
});

describe('isFilterActive', () => {
  it('is false for an empty filter and true once any clause is set', () => {
    expect(isFilterActive({})).toBe(false);
    expect(isFilterActive({ text: 'x' })).toBe(true);
    expect(isFilterActive({ favorite: true })).toBe(true);
    expect(isFilterActive({ include: { vibe: ['v1'] } })).toBe(true);
    expect(isFilterActive({ include: {} })).toBe(false);
  });
});
