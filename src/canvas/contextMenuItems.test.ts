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

  it('Make a palette only for one photo that has sampled colours', () => {
    const palette = [{ hex: '#ffffff', weight: 1 }];
    expect(contextMenuItemIds([item({})], ctx)).not.toContain('make-palette');
    expect(contextMenuItemIds([item({ palette })], ctx)).toContain('make-palette');
    expect(contextMenuItemIds([item({ palette }), item({ id: 'b', palette })], ctx)).not.toContain(
      'make-palette',
    );
  });

  it('swatches never offer Make a palette; they offer Combine, Edit and Copy instead', () => {
    const sw = (id: string) =>
      item({ id, kind: 'swatch', filePath: null, palette: [{ hex: '#ffffff', weight: 1 }] });
    const one = contextMenuItemIds([sw('a')], ctx);
    expect(one).not.toContain('make-palette');
    expect(one).toEqual(expect.arrayContaining(['edit-palette', 'copy-colors']));
    expect(one).not.toContain('combine-palette');
    const two = contextMenuItemIds([sw('a'), sw('b')], ctx);
    expect(two).toContain('combine-palette');
    expect(two).not.toContain('edit-palette');
    expect(
      contextMenuItemIds([sw('a'), item({ id: 'b', kind: 'note', filePath: null })], ctx),
    ).not.toContain('combine-palette');
  });

  it('a note gets its own short menu: edit (one only), colours, stacking, trash', () => {
    const note = (id: string) => item({ id, kind: 'note', filePath: null });
    const one = contextMenuItemIds([note('a')], ctx);
    expect(one).toEqual([
      'edit-note',
      'note-color-cream',
      'note-color-blush',
      'note-color-sage',
      'note-color-sky',
      'note-color-lavender',
      'note-color-ink',
      'bring-to-front',
      'send-to-back',
      'move-to-trash',
    ]);
    expect(contextMenuItemIds([note('a'), note('b')], ctx)).not.toContain('edit-note');
    expect(one).not.toContain('create-board');
    expect(one).not.toContain('connect-to');
  });

  it('create board, trash and stacking always; remove-from-board only on a board', () => {
    const off = contextMenuItemIds([item({ kind: 'swatch', filePath: null })], ctx);
    expect(off).toEqual(
      expect.arrayContaining(['bring-to-front', 'send-to-back', 'create-board', 'move-to-trash']),
    );
    expect(off).not.toContain('remove-from-board');
    expect(contextMenuItemIds([item({})], { onBoard: true })).toContain('remove-from-board');
  });
});

describe('description entries', () => {
  it('a single media item offers Add or Edit description; notes and multi-selections do not', () => {
    expect(contextMenuItemIds([item({})], ctx)).toContain('description-add');
    expect(contextMenuItemIds([item({ descriptionText: 'x' })], ctx)).toContain('description-edit');
    expect(contextMenuItemIds([item({}), item({ id: 'b' })], ctx)).not.toContain('description-add');
    expect(contextMenuItemIds([item({ kind: 'swatch', filePath: null })], ctx)).not.toContain(
      'description-add',
    );
  });

  it('Adjust crop and Reset crop only for one cropped picture', () => {
    const cropped = contextMenuItemIds([item({})], { onBoard: false, cropped: true });
    expect(cropped).toContain('adjust-crop');
    expect(cropped).toContain('reset-crop');
    expect(contextMenuItemIds([item({})], ctx)).not.toContain('adjust-crop');
    expect(
      contextMenuItemIds([item({}), item({ id: 'b' })], { onBoard: false, cropped: true }),
    ).not.toContain('adjust-crop');
  });

  it('offers Add to favorites, or Remove when every item already is one (media items only)', () => {
    expect(contextMenuItemIds([item({})], ctx)).toContain('add-favorite');
    expect(contextMenuItemIds([item({ favorite: true })], ctx)).toContain('remove-favorite');
    expect(
      contextMenuItemIds([item({ favorite: true }), item({ id: 'b', favorite: false })], ctx),
    ).toContain('add-favorite');
    expect(contextMenuItemIds([item({ kind: 'note', filePath: null })], ctx)).not.toContain(
      'add-favorite',
    );
  });

  describe('type collections (Patch 2 · F5)', () => {
    const fam = (id: string) => item({ id, kind: 'font', filePath: 'f.ttf' });
    const col = (id: string, ids: string[]) =>
      item({ id, kind: 'font', filePath: null, fontCollection: { ids } });
    it('offers Make a type collection for two or more families, never for one', () => {
      expect(contextMenuItemIds([fam('a'), fam('b')], ctx)).toContain('make-type-collection');
      expect(contextMenuItemIds([fam('a')], ctx)).not.toContain('make-type-collection');
      expect(contextMenuItemIds([fam('a'), item({ id: 'p' })], ctx)).not.toContain(
        'make-type-collection',
      );
    });
    it('offers Add to … for one collection plus families that are not in it', () => {
      expect(contextMenuItemIds([col('c', ['a']), fam('b')], ctx)).toContain(
        'add-to-type-collection',
      );
      expect(contextMenuItemIds([col('c', ['a']), fam('a')], ctx)).not.toContain(
        'add-to-type-collection',
      );
    });
    it('offers Remove from collection for one member, and a collection is not media', () => {
      expect(contextMenuItemIds([fam('a')], { ...ctx, inCollection: true })).toContain(
        'remove-from-type-collection',
      );
      const ids = contextMenuItemIds([col('c', ['a'])], ctx);
      expect(ids).not.toContain('add-favorite');
      expect(ids).not.toContain('back-to-inbox');
      expect(ids).not.toContain('show-in-explorer');
    });
  });
});
