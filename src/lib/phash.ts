/**
 * A 64-bit DCT perceptual hash for near-duplicate detection (§2.3, §4.7): perceptual-hash
 * distance ≤ 6 of 64 bits flags a near duplicate. Operates on a pre-resized 32×32 grayscale
 * buffer so the DCT math stays pure and unit-testable without decoding real images here — the
 * ingest worker does the resize/grayscale step with `OffscreenCanvas` and calls `computePHash`.
 */

const SIZE = 32;
const LOW_FREQ = 8;

function dctCoefficient(pixels: Float64Array, u: number, v: number): number {
  let sum = 0;
  for (let x = 0; x < SIZE; x++) {
    const cosU = Math.cos(((2 * x + 1) * u * Math.PI) / (2 * SIZE));
    for (let y = 0; y < SIZE; y++) {
      const cosV = Math.cos(((2 * y + 1) * v * Math.PI) / (2 * SIZE));
      sum += pixels[x * SIZE + y] * cosU * cosV;
    }
  }
  const alphaU = u === 0 ? Math.sqrt(1 / SIZE) : Math.sqrt(2 / SIZE);
  const alphaV = v === 0 ? Math.sqrt(1 / SIZE) : Math.sqrt(2 / SIZE);
  return alphaU * alphaV * sum;
}

/**
 * `pixels` must be a 32×32 grayscale buffer (row-major, length 1024, values 0–255).
 * Returns a 16-character lowercase hex string (64 bits).
 */
export function computePHash(pixels: Float64Array | number[]): string {
  if (pixels.length !== SIZE * SIZE) {
    throw new Error(`computePHash expects a ${SIZE}x${SIZE} buffer (${SIZE * SIZE} values)`);
  }
  const buf = pixels instanceof Float64Array ? pixels : Float64Array.from(pixels);

  const coefficients: number[] = [];
  for (let u = 0; u < LOW_FREQ; u++) {
    for (let v = 0; v < LOW_FREQ; v++) {
      coefficients.push(dctCoefficient(buf, u, v));
    }
  }

  // Median excludes the DC term (index 0, u=v=0) — standard pHash practice, since it just
  // encodes overall brightness and would otherwise dominate the threshold.
  const withoutDc = coefficients.slice(1).sort((a, b) => a - b);
  const mid = Math.floor(withoutDc.length / 2);
  const median =
    withoutDc.length % 2 === 0 ? (withoutDc[mid - 1] + withoutDc[mid]) / 2 : withoutDc[mid];

  let bits = 0n;
  for (const c of coefficients) {
    bits = (bits << 1n) | (c > median ? 1n : 0n);
  }
  return bits.toString(16).padStart(16, '0');
}

/** Hamming distance between two 16-hex-char pHash strings, in bits (0–64). */
export function hammingDistance(a: string, b: string): number {
  const ai = BigInt(`0x${a}`);
  const bi = BigInt(`0x${b}`);
  let x = ai ^ bi;
  let count = 0;
  while (x > 0n) {
    count += Number(x & 1n);
    x >>= 1n;
  }
  return count;
}

/** §2.3: perceptual-hash distance ≤ 6 of 64 bits flags a near duplicate. */
export const NEAR_DUPLICATE_THRESHOLD = 6;

export function isNearDuplicate(a: string, b: string): boolean {
  return hammingDistance(a, b) <= NEAR_DUPLICATE_THRESHOLD;
}
