/**
 * Palette extraction (k-means in OKLab) and color-family classification (OKLCH rules) — §3.2,
 * §4.7. The ingest worker downsamples a 64×64 RGBA sample and calls `extractPalette`; the
 * result's families feed `colorFamily`/`weightedColorFamilies` for the Color filter and hubs.
 */
import { converter, formatHex } from 'culori';

const toOklab = converter('oklab');
const toOklch = converter('oklch');

export interface PaletteEntry {
  hex: string;
  weight: number;
}

export type ColorFamily =
  | 'red'
  | 'orange'
  | 'yellow'
  | 'green'
  | 'teal'
  | 'blue'
  | 'purple'
  | 'pink'
  | 'brown'
  | 'black'
  | 'grey'
  | 'white';

/** Deterministic mulberry32 PRNG, seeded, so k-means (and therefore the palette) is reproducible
 * for the same input — §7.3 "palette determinism". */
function mulberry32(seed: number): () => number {
  let s = seed;
  return () => {
    s = Math.imul(s ^ (s >>> 15), s | 1);
    s ^= s + Math.imul(s ^ (s >>> 7), s | 61);
    return ((s ^ (s >>> 14)) >>> 0) / 4294967296;
  };
}

function dist2(a: number[], b: number[]): number {
  const dx = a[0] - b[0];
  const dy = a[1] - b[1];
  const dz = a[2] - b[2];
  return dx * dx + dy * dy + dz * dz;
}

function kmeans(
  points: number[][],
  k: number,
  iterations = 10,
  seed = 1,
): { centroids: number[][]; assignments: number[] } {
  if (points.length === 0) return { centroids: [], assignments: [] };
  const kEff = Math.min(k, points.length);
  const rand = mulberry32(seed);

  // k-means++ initialization for stable, well-spread starting centroids. Centroids are copies,
  // never references into `points` — otherwise averaging assigned points back into a centroid
  // (below) would mutate a live data point through aliasing.
  const centroids: number[][] = [[...points[Math.floor(rand() * points.length)]]];
  while (centroids.length < kEff) {
    const distances = points.map((p) => Math.min(...centroids.map((c) => dist2(p, c))));
    const total = distances.reduce((a, b) => a + b, 0);
    if (total === 0) {
      centroids.push([...points[centroids.length % points.length]]);
      continue;
    }
    let r = rand() * total;
    let idx = 0;
    for (; idx < distances.length - 1; idx++) {
      r -= distances[idx];
      if (r <= 0) break;
    }
    centroids.push([...points[idx]]);
  }

  let assignments = new Array<number>(points.length).fill(0);
  for (let iter = 0; iter < iterations; iter++) {
    assignments = points.map((p) => {
      let best = 0;
      let bestD = Infinity;
      centroids.forEach((c, ci) => {
        const d = dist2(p, c);
        if (d < bestD) {
          bestD = d;
          best = ci;
        }
      });
      return best;
    });

    const sums = centroids.map(() => [0, 0, 0]);
    const counts = new Array<number>(centroids.length).fill(0);
    points.forEach((p, i) => {
      const a = assignments[i];
      sums[a][0] += p[0];
      sums[a][1] += p[1];
      sums[a][2] += p[2];
      counts[a]++;
    });
    centroids.forEach((c, ci) => {
      if (counts[ci] > 0) {
        c[0] = sums[ci][0] / counts[ci];
        c[1] = sums[ci][1] / counts[ci];
        c[2] = sums[ci][2] / counts[ci];
      }
    });
  }

  return { centroids, assignments };
}

/**
 * `rgba` is a flat RGBA buffer (values 0–255), typically a 64×64 downsample of the image.
 * Returns up to `k` palette entries sorted by weight (share of sampled pixels), descending.
 */
export function extractPalette(
  rgba: Uint8ClampedArray | Uint8Array,
  k = 5,
  seed = 1,
): PaletteEntry[] {
  const pixelCount = rgba.length / 4;
  const points: number[][] = [];
  for (let i = 0; i < pixelCount; i++) {
    const r = rgba[i * 4] / 255;
    const g = rgba[i * 4 + 1] / 255;
    const b = rgba[i * 4 + 2] / 255;
    const alpha = rgba[i * 4 + 3];
    if (alpha < 16) continue; // skip near-transparent pixels
    const lab = toOklab({ mode: 'rgb', r, g, b });
    points.push([lab.l, lab.a ?? 0, lab.b ?? 0]);
  }
  if (points.length === 0) return [];

  const { centroids, assignments } = kmeans(points, k, 10, seed);
  const counts: number[] = new Array<number>(centroids.length).fill(0);
  for (const a of assignments) counts[a]++;

  // Merge centroids that converged to the same displayed hex (e.g. a near-solid-color image,
  // where floating-point drift can split one true cluster across two or three centroids).
  const byHex = new Map<string, number>();
  centroids.forEach((c, i) => {
    if (counts[i] === 0) return;
    const hex = formatHex({ mode: 'oklab', l: c[0], a: c[1], b: c[2] });
    byHex.set(hex, (byHex.get(hex) ?? 0) + counts[i]);
  });

  return [...byHex.entries()]
    .map(([hex, count]) => ({ hex, weight: count / assignments.length }))
    .sort((a, b) => b.weight - a.weight);
}

/**
 * Classifies a hex color into one of the 12 families from §3.2, using OKLCH lightness/chroma/hue.
 * The exact thresholds are a reasonable approximation — the plan specifies the family list and
 * "OKLCH rules" without exact numbers; tune here if real libraries misclassify often.
 */
export function colorFamily(hex: string): ColorFamily {
  const c = toOklch(hex);
  if (!c) return 'grey';
  const { l, c: chroma, h } = c;
  const hue = (((h ?? 0) % 360) + 360) % 360;

  if (l >= 0.97 && chroma < 0.03) return 'white';
  if (l <= 0.12) return 'black';
  if (chroma < 0.035) return 'grey';
  if (l < 0.6 && chroma < 0.1 && hue >= 35 && hue < 85) return 'brown';

  // Bucket boundaries sit at the midpoints between each family token's own OKLCH hue
  // (src/design/tokens.css §3.2) — see scripts/_hue_check.mjs for how these were derived.
  // Pink wraps around 0°/360° (its neighbors are purple below and red above the wrap).
  if (hue >= 322 || hue < 6.6) return 'pink';
  if (hue < 43.5) return 'red';
  if (hue < 76) return 'orange';
  if (hue < 119) return 'yellow';
  if (hue < 163) return 'green';
  if (hue < 220) return 'teal';
  if (hue < 279) return 'blue';
  return 'purple';
}

/** Families whose combined palette weight is ≥ 15% — §4.9 (used for the Color filter and hubs). */
export function weightedColorFamilies(palette: PaletteEntry[], threshold = 0.15): ColorFamily[] {
  const weights = new Map<ColorFamily, number>();
  for (const entry of palette) {
    const family = colorFamily(entry.hex);
    weights.set(family, (weights.get(family) ?? 0) + entry.weight);
  }
  return [...weights.entries()]
    .filter(([, weight]) => weight >= threshold)
    .sort((a, b) => b[1] - a[1])
    .map(([family]) => family);
}
