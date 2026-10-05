import { describe, expect, it } from 'vitest';
import type { Item, Placement } from '@/state/types';
import { browseOrder, neighbourId } from './browseOrder';

const item = (id: string, kind: Item['kind'] = 'image', extra: Partial<Item> = {}) =>
  ({ id, kind, deletedAt: null, ...extra }) as unknown as Item;
const place = (id: string, x: number, y: number, h = 100): Placement => ({
  boardId: 'b',
  itemId: id,
  x,
  y,
  w: 100,
  h,
  z: 0,
  frameId: null,
  cropX: null,
  cropY: null,
  parentId: null,
  addedAt: 'x',
});

describe('browseOrder', () => {
  it('goes row by row, left to right, skipping notes, trashed items and palettes', () => {
    const items = new Map([
      ['a', item('a')],
      ['b', item('b')],
      ['c', item('c')],
      ['d', item('d')],
      ['n', item('n', 'note')],
      ['t', item('t', 'image', { deletedAt: 'x' })],
      ['p', item('p', 'swatch')],
    ]);
    const placements = new Map([
      ['b', place('b', 300, 10)], // same row as a, a little lower
      ['a', place('a', 0, 0)],
      ['c', place('c', 0, 400)],
      ['d', place('d', 200, 390)],
      ['n', place('n', 500, 0)],
      ['t', place('t', 600, 0)],
      ['p', place('p', 700, 0)],
    ]);
    expect(browseOrder(items, placements)).toEqual(['a', 'b', 'c', 'd']);
  });
});

describe('neighbourId', () => {
  const order = ['a', 'b', 'c'];
  it('moves next and previous, wrapping around', () => {
    expect(neighbourId(order, 'a', 1)).toBe('b');
    expect(neighbourId(order, 'c', 1)).toBe('a');
    expect(neighbourId(order, 'a', -1)).toBe('c');
  });
  it('starts at the first (or last) when nothing is current', () => {
    expect(neighbourId(order, null, 1)).toBe('a');
    expect(neighbourId(order, 'zzz', -1)).toBe('c');
    expect(neighbourId([], 'a', 1)).toBeNull();
  });
});
