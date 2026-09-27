import { describe, expect, it } from 'vitest';
import { colorFamily, extractPalette, weightedColorFamilies } from './color';

function solidRgba(r: number, g: number, b: number, count = 64 * 64): Uint8ClampedArray {
  const buf = new Uint8ClampedArray(count * 4);
  for (let i = 0; i < count; i++) {
    buf[i * 4] = r;
    buf[i * 4 + 1] = g;
    buf[i * 4 + 2] = b;
    buf[i * 4 + 3] = 255;
  }
  return buf;
}

function splitRgba(
  a: [number, number, number],
  b: [number, number, number],
  count = 64 * 64,
): Uint8ClampedArray {
  const buf = new Uint8ClampedArray(count * 4);
  for (let i = 0; i < count; i++) {
    const [r, g, bl] = i < count / 2 ? a : b;
    buf[i * 4] = r;
    buf[i * 4 + 1] = g;
    buf[i * 4 + 2] = bl;
    buf[i * 4 + 3] = 255;
  }
  return buf;
}

describe('extractPalette', () => {
  it('returns a single entry at weight 1 for a solid color', () => {
    const palette = extractPalette(solidRgba(233, 168, 69), 5);
    expect(palette).toHaveLength(1);
    expect(palette[0].weight).toBeCloseTo(1, 5);
  });

  it('splits a two-color image into two weighted entries', () => {
    const palette = extractPalette(splitRgba([255, 0, 0], [0, 0, 255]), 5);
    expect(palette.length).toBeGreaterThanOrEqual(2);
    const totalWeight = palette.reduce((s, p) => s + p.weight, 0);
    expect(totalWeight).toBeCloseTo(1, 2);
  });

  it('is deterministic for the same input and seed', () => {
    const rgba = splitRgba([20, 200, 120], [200, 20, 90]);
    expect(extractPalette(rgba, 5, 7)).toEqual(extractPalette(rgba, 5, 7));
  });

  it('returns an empty palette for a fully transparent image', () => {
    const buf = new Uint8ClampedArray(64 * 64 * 4); // all zero = alpha 0
    expect(extractPalette(buf)).toEqual([]);
  });

  it('sorts entries by descending weight', () => {
    const buf = new Uint8ClampedArray(100 * 4);
    for (let i = 0; i < 100; i++) {
      const isMajority = i < 80;
      buf[i * 4] = isMajority ? 10 : 250;
      buf[i * 4 + 1] = isMajority ? 10 : 250;
      buf[i * 4 + 2] = isMajority ? 10 : 250;
      buf[i * 4 + 3] = 255;
    }
    const palette = extractPalette(buf, 2);
    expect(palette[0].weight).toBeGreaterThanOrEqual(palette[palette.length - 1].weight);
  });
});

describe('colorFamily', () => {
  it('classifies pure red', () => {
    expect(colorFamily('#ff0000')).toBe('red');
  });

  it('classifies pure blue', () => {
    expect(colorFamily('#0000ff')).toBe('blue');
  });

  it('classifies white and black', () => {
    expect(colorFamily('#ffffff')).toBe('white');
    expect(colorFamily('#000000')).toBe('black');
  });

  it('classifies a mid grey as grey', () => {
    expect(colorFamily('#888888')).toBe('grey');
  });
});

describe('weightedColorFamilies', () => {
  it('keeps only families at or above the threshold', () => {
    const families = weightedColorFamilies(
      [
        { hex: '#ff0000', weight: 0.8 },
        { hex: '#0000ff', weight: 0.1 },
      ],
      0.15,
    );
    expect(families).toEqual(['red']);
  });

  it('combines weight across palette entries in the same family', () => {
    const families = weightedColorFamilies([
      { hex: '#ff0000', weight: 0.1 },
      { hex: '#ee0000', weight: 0.1 },
    ]);
    expect(families).toContain('red');
  });
});
