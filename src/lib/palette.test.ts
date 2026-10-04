import { describe, expect, it } from 'vitest';
import {
  colorFamiliesOf,
  hexToHsv,
  hsvToHex,
  normalizeHex,
  paletteCardSize,
  paletteCellAt,
  paletteCells,
  paletteEntriesOf,
  swatchColorsOf,
} from './palette';

describe('normalizeHex', () => {
  it('accepts the common spellings', () => {
    expect(normalizeHex('#abc')).toBe('#AABBCC');
    expect(normalizeHex('abc')).toBe('#AABBCC');
    expect(normalizeHex('#aabbcc')).toBe('#AABBCC');
    expect(normalizeHex(' AABBCC ')).toBe('#AABBCC');
  });
  it('rejects anything else', () => {
    for (const bad of ['', '#ab', '#abcd', 'ggg', '#12345g', '#1234567']) {
      expect(normalizeHex(bad)).toBeNull();
    }
  });
});

describe('swatchColorsOf', () => {
  it('prefers the list, then the legacy colour, then grey', () => {
    expect(swatchColorsOf({ swatchColors: [{ hex: '#111111' }], color: '#222222' })).toEqual([
      { hex: '#111111' },
    ]);
    expect(swatchColorsOf({ swatchColors: [], color: '#222222' })).toEqual([{ hex: '#222222' }]);
    expect(swatchColorsOf({ swatchColors: null, color: null })).toEqual([{ hex: '#8C8C8C' }]);
  });
});

describe('card geometry', () => {
  it('sizes 1 colour as 160×160 and more as two columns', () => {
    expect(paletteCardSize(0)).toEqual({ w: 160, h: 160 });
    expect(paletteCardSize(1)).toEqual({ w: 160, h: 160 });
    expect(paletteCardSize(2)).toEqual({ w: 216, h: 112 });
    expect(paletteCardSize(5)).toEqual({ w: 216, h: 16 + 3 * 96 + 2 * 8 });
    expect(paletteCardSize(6)).toEqual(paletteCardSize(5));
  });

  it('lays cells out row-major in 2 columns, odd counts leave a hole', () => {
    const card = { x: 100, y: 200, w: 216, h: 320 };
    const cells = paletteCells(3, card);
    expect(cells[0]).toEqual({ x: 108, y: 208, w: 96, h: 96 });
    expect(cells[1]).toEqual({ x: 212, y: 208, w: 96, h: 96 });
    expect(cells[2]).toEqual({ x: 108, y: 312, w: 96, h: 96 });
    expect(cells).toHaveLength(3);
  });

  it('a single colour fills the card', () => {
    const card = { x: 0, y: 0, w: 160, h: 160 };
    expect(paletteCells(1, card)).toEqual([card]);
    expect(paletteCells(0, card)).toEqual([]);
  });

  it('finds the cell under a point, and null in gaps, padding and the empty slot', () => {
    const card = { x: 0, y: 0, w: 216, h: 216 };
    expect(paletteCellAt(3, card, { x: 20, y: 20 })).toBe(0);
    expect(paletteCellAt(3, card, { x: 150, y: 20 })).toBe(1);
    expect(paletteCellAt(3, card, { x: 20, y: 150 })).toBe(2);
    expect(paletteCellAt(3, card, { x: 150, y: 150 })).toBeNull(); // the empty fourth slot
    expect(paletteCellAt(3, card, { x: 3, y: 3 })).toBeNull(); // padding
    expect(paletteCellAt(1, { x: 0, y: 0, w: 160, h: 160 }, { x: 80, y: 80 })).toBe(0);
  });
});

describe('palette entries and families', () => {
  it('gives equal weights', () => {
    expect(paletteEntriesOf([{ hex: '#FF0000' }, { hex: '#00FF00' }])).toEqual([
      { hex: '#FF0000', weight: 0.5 },
      { hex: '#00FF00', weight: 0.5 },
    ]);
  });
  it('lists each colour family once', () => {
    const fams = colorFamiliesOf([{ hex: '#FF0000' }, { hex: '#EE0000' }, { hex: '#0000FF' }]);
    expect(fams).toHaveLength(2);
  });
});

describe('hsv', () => {
  it('converts primaries', () => {
    expect(hexToHsv('#FF0000')).toEqual({ h: 0, s: 1, v: 1 });
    expect(hsvToHex(120, 1, 1)).toBe('#00FF00');
  });
  it('greys have hue 0', () => {
    const g = hexToHsv('#808080');
    expect(g.h).toBe(0);
    expect(g.s).toBe(0);
  });
  it('round-trips within one step per channel', () => {
    for (const hex of ['#E9A845', '#93B89D', '#102030', '#FFFFFF', '#000000', '#8C8C8C']) {
      const { h, s, v } = hexToHsv(hex);
      const back = hsvToHex(h, s, v);
      for (let i = 1; i < 7; i += 2) {
        const a = parseInt(hex.slice(i, i + 2), 16);
        const b = parseInt(back.slice(i, i + 2), 16);
        expect(Math.abs(a - b)).toBeLessThanOrEqual(1);
      }
    }
  });
});
