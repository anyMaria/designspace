import { describe, expect, it } from 'vitest';
import { computePHash, hammingDistance, isNearDuplicate } from './phash';

function solidImage(value: number): number[] {
  return new Array<number>(32 * 32).fill(value);
}

function gradientImage(): number[] {
  const pixels: number[] = [];
  for (let x = 0; x < 32; x++) {
    for (let y = 0; y < 32; y++) pixels.push(((x + y) / 64) * 255);
  }
  return pixels;
}

function checkerboard(): number[] {
  const pixels: number[] = [];
  for (let x = 0; x < 32; x++) {
    for (let y = 0; y < 32; y++) pixels.push((x + y) % 2 === 0 ? 255 : 0);
  }
  return pixels;
}

/** A photo-like pattern (a few overlaid sine waves) — more texture than a plain gradient, so
 * DCT coefficients aren't clustered right at the median threshold. */
function photoLike(): number[] {
  const pixels: number[] = [];
  for (let x = 0; x < 32; x++) {
    for (let y = 0; y < 32; y++) {
      const v =
        128 +
        60 * Math.sin(x / 3) +
        40 * Math.cos(y / 4) +
        20 * Math.sin((x + y) / 5) -
        15 * Math.cos((x - y) / 6);
      pixels.push(Math.max(0, Math.min(255, v)));
    }
  }
  return pixels;
}

describe('computePHash', () => {
  it('produces a 16-character hex string', () => {
    const hash = computePHash(gradientImage());
    expect(hash).toMatch(/^[0-9a-f]{16}$/);
  });

  it('is deterministic', () => {
    const pixels = gradientImage();
    expect(computePHash(pixels)).toBe(computePHash(pixels));
  });

  it('throws on a buffer of the wrong size', () => {
    expect(() => computePHash([1, 2, 3])).toThrow();
  });

  it('gives very different hashes for very different images', () => {
    const a = computePHash(gradientImage());
    const b = computePHash(checkerboard());
    expect(hammingDistance(a, b)).toBeGreaterThan(6);
  });

  it('is stable under a tiny brightness shift (near-duplicate)', () => {
    const original = photoLike();
    const brighter = original.map((v) => Math.min(255, v + 3));
    const a = computePHash(original);
    const b = computePHash(brighter);
    expect(isNearDuplicate(a, b)).toBe(true);
  });
});

describe('hammingDistance', () => {
  it('is zero for identical hashes', () => {
    const hash = computePHash(solidImage(128));
    expect(hammingDistance(hash, hash)).toBe(0);
  });

  it('counts differing bits', () => {
    expect(hammingDistance('0000000000000000', '0000000000000001')).toBe(1);
    expect(hammingDistance('0000000000000000', 'ffffffffffffffff')).toBe(64);
  });
});

describe('isNearDuplicate', () => {
  it('uses the 6-bit threshold from §2.3', () => {
    expect(isNearDuplicate('0000000000000000', '0000000000000000')).toBe(true);
    expect(isNearDuplicate('0000000000000000', '000000000000003f')).toBe(true); // distance 6 (6 bits set)
    expect(isNearDuplicate('0000000000000000', '000000000000007f')).toBe(false); // distance 7 (7 bits set)
  });
});
