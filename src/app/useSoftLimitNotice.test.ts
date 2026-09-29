import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { cleanup, renderHook } from '@testing-library/react';
import { useSoftLimitNotice } from './useSoftLimitNotice';
import { useLibraryStore } from '@/state/libraryStore';
import { useToastStore } from '@/state/toastStore';
import type { Item } from '@/state/types';

function itemsMap(count: number): Map<string, Item> {
  const map = new Map<string, Item>();
  for (let i = 0; i < count; i++) map.set(`item-${i}`, { id: `item-${i}` } as Item);
  return map;
}

beforeEach(() => {
  useLibraryStore.setState({ items: new Map() });
  useToastStore.setState({ toasts: [] });
});

afterEach(() => {
  cleanup();
});

describe('useSoftLimitNotice', () => {
  it('shows nothing below the 9,500 threshold', () => {
    useLibraryStore.setState({ items: itemsMap(9499) });
    renderHook(() => useSoftLimitNotice());
    expect(useToastStore.getState().toasts).toHaveLength(0);
  });

  it('shows a toast once the item count reaches 9,500', () => {
    useLibraryStore.setState({ items: itemsMap(9500) });
    renderHook(() => useSoftLimitNotice());
    expect(useToastStore.getState().toasts).toHaveLength(1);
  });

  it('only shows the toast once per mount, even as the count keeps growing', () => {
    useLibraryStore.setState({ items: itemsMap(9500) });
    const { rerender } = renderHook(() => useSoftLimitNotice());
    useLibraryStore.setState({ items: itemsMap(9600) });
    rerender();
    useLibraryStore.setState({ items: itemsMap(9700) });
    rerender();
    expect(useToastStore.getState().toasts).toHaveLength(1);
  });
});
