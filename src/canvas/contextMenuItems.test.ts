import { describe, expect, it } from 'vitest';
import { contextMenuItemIds } from './contextMenuItems';
import type { Item } from '@/state/types';

const item = (o: Partial<Item>): Item =>
  ({ id: 'a', kind: 'image', filePath: 'media/a.jpg', palette: null, ...o }) as Item;
const ctx = { onBoard: false };

describe('contextMenuItemIds', () => {
  it('copy image only for exactly one image', () => {
    expect(contextMenuItemIds([item({})], ctx)).toContain('copy-image');
    expect(contextMenuItemIds([item({}), item({ id: 'b' })], ctx)).not.toContain('copy-image');
    expect(contextMenuItemIds([item({ kind: 'note', filePath: null })], ctx)).not.toContain(
      'copy-image',
    );
  });

  it('show in Explorer only when every item has a file', () => {
    expect(contextMenuItemIds([item({}), item({ id: 'b', filePath: null })], ctx)).not.toContain(
      'show-in-explorer',
    );
    expect(contextMenuItemIds([item({})], ctx)).toContain('show-in-explorer');
  });

  it('tidy up for 2+, connect to for exactly 1', () => {
    const two = contextMenuItemIds([item({}), item({ id: 'b' })], ctx);
    expect(two).toContain('tidy-up');
    expect(two).not.toContain('connect-to');
    const one = contextMenuItemIds([item({})], ctx);
    expect(one).not.toContain('tidy-up');
    expect(one).toContain('connect-to');
  });

  it('back to Inbox only when every item is a media kind', () => {
    expect(contextMenuItemIds([item({ kind: 'link', filePath: null })], ctx)).toContain(
      'back-to-inbox',
    );
    expect(contextMenuItemIds([item({ kind: 'note', filePath: null })], ctx)).not.toContain(
      'back-to-inbox',
    );
    expect(contextMenuItemIds([item({}), item({ id: 'b', kind: 'swatch' })], ctx)).not.toContain(
      'back-to-inbox',
    );
  });

  it('extract palette only when something has a palette', () => {
    expect(contextMenuItemIds([item({})], ctx)).not.toContain('extract-palette');
    expect(contextMenuItemIds([item({ palette: [{ hex: '#ffffff', weight: 1 }] })], ctx)).toContain(
      'extract-palette',
    );
  });

  it('create board, trash and stacking always; remove-from-board only on a board', () => {
    const off = contextMenuItemIds([item({ kind: 'note', filePath: null })], ctx);
    expect(off).toEqual(
      expect.arrayContaining(['bring-to-front', 'send-to-back', 'create-board', 'move-to-trash']),
    );
    expect(off).not.toContain('remove-from-board');
    expect(contextMenuItemIds([item({})], { onBoard: true })).toContain('remove-from-board');
  });
});
