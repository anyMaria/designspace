import { describe, expect, it } from 'vitest';
import type { FontFile } from '@/state/types';
import { fontCardOf, familyKey, isFontCollection, pickDefaultStyle } from './fontFamily';

function file(id: string, weight: number, over: Partial<FontFile> = {}): FontFile {
  return {
    id,
    itemId: 'i',
    filePath: `f/${id}`,
    fileName: id,
    fileHash: id,
    fileSize: 1,
    mime: null,
    styleName: id,
    weight,
    italic: false,
    axes: null,
    instances: null,
    sort: 0,
    status: 'ok',
    createdAt: '2026-01-01T00:00:00.000Z',
    deletedAt: null,
    ...over,
  };
}
const axis = (min: number, max: number) => [
  { tag: 'wght', name: 'Weight', min, max, default: min },
];

describe('familyKey', () => {
  it('ignores case, spaces, punctuation and accents', () => {
    expect(familyKey({ family: 'Urbanist' })).toBe(familyKey({ family: ' urbanist ' }));
    expect(familyKey({ family: 'Fira Sans' })).toBe(familyKey({ family: 'fira-sans' }));
    expect(familyKey({ family: 'Café' })).toBe('cafe');
  });
});

describe('pickDefaultStyle', () => {
  it('Thin + Regular + Bold → Regular', () => {
    const r = file('regular', 400);
    expect(pickDefaultStyle([file('thin', 100), r, file('bold', 700)]).fileId).toBe('regular');
  });
  it('only italics → the one closest to 400', () => {
    const pick = pickDefaultStyle([
      file('a', 300, { italic: true }),
      file('b', 500, { italic: true }),
      file('c', 900, { italic: true }),
    ]);
    expect(pick.fileId).toBe('a'); // 300 and 500 tie → the lower one
  });
  it('non-italic wins over a closer italic', () => {
    expect(pickDefaultStyle([file('i', 400, { italic: true }), file('u', 700)]).fileId).toBe('u');
  });
  it('a variable 100–900 file → 400', () => {
    expect(pickDefaultStyle([file('v', 100, { axes: axis(100, 900) })])).toEqual({
      fileId: 'v',
      wght: 400,
    });
  });
  it('a variable 500–900 file → 500', () => {
    expect(pickDefaultStyle([file('v', 500, { axes: axis(500, 900) })]).wght).toBe(500);
  });
  it('no files → nothing', () => {
    expect(pickDefaultStyle([])).toEqual({ fileId: null, wght: null });
  });
});

describe('fontCardOf and isFontCollection', () => {
  it('returns the stored options, or the defaults', () => {
    const files = [file('a', 400), file('b', 700)];
    const stored = { fileId: 'b', wght: null, size: 'l' as const, text: 'Hi' };
    expect(fontCardOf({ fontCard: stored }, files)).toEqual(stored);
    expect(fontCardOf({ fontCard: null }, files)).toEqual({
      fileId: 'a',
      wght: null,
      size: 'm',
      text: null,
    });
  });
  it('a stored file that is gone falls back to the default style', () => {
    const files = [file('a', 400)];
    expect(
      fontCardOf({ fontCard: { fileId: 'gone', wght: null, size: 's', text: null } }, files).fileId,
    ).toBe('a');
  });
  it('only a font item with a collection is a collection', () => {
    expect(isFontCollection({ kind: 'font', fontCollection: { ids: [] } })).toBe(true);
    expect(isFontCollection({ kind: 'font', fontCollection: null })).toBe(false);
    expect(isFontCollection({ kind: 'image', fontCollection: { ids: [] } })).toBe(false);
  });
});
