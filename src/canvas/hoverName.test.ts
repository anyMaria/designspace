import { describe, expect, it } from 'vitest';
import { hoverNameFor } from './hoverName';
import type { Item } from '@/state/types';

const item = (o: Partial<Item>): Item => ({ id: 'a', kind: 'image', title: '', ...o }) as Item;

describe('hoverNameFor', () => {
  it('uses the trimmed title, then the file name, then the kind', () => {
    expect(hoverNameFor(item({ title: '  BAUHAUS 1 ' }))).toBe('BAUHAUS 1');
    expect(hoverNameFor(item({ fileName: 'x.jpg' }))).toBe('x.jpg');
    expect(hoverNameFor(item({ fileName: null }))).toBe('Image');
  });
  it('gives notes no pill and swatches one only when named', () => {
    expect(hoverNameFor(item({ kind: 'note', title: 'hi' }))).toBeNull();
    expect(hoverNameFor(item({ kind: 'swatch' }))).toBeNull();
    expect(hoverNameFor(item({ kind: 'swatch', title: 'Sage' }))).toBe('Sage');
  });
});
