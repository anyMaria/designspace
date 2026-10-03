import { describe, expect, it } from 'vitest';
import { pixelAtUv, rgbToHex } from './pickColor';

describe('rgbToHex', () => {
  it('formats uppercase, padded, and clamps', () => {
    expect(rgbToHex(255, 0, 5)).toBe('#FF0005');
    expect(rgbToHex(300, -4, 15.6)).toBe('#FF0010');
  });
});

describe('pixelAtUv', () => {
  it('maps fractions to pixels and stays inside the image', () => {
    expect(pixelAtUv(0, 0, 512, 256)).toEqual({ x: 0, y: 0 });
    expect(pixelAtUv(0.5, 0.5, 512, 256)).toEqual({ x: 256, y: 128 });
    expect(pixelAtUv(1, 1, 512, 256)).toEqual({ x: 511, y: 255 });
    expect(pixelAtUv(-0.2, 1.4, 512, 256)).toEqual({ x: 0, y: 255 });
  });
});
