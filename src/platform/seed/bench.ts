/**
 * `?bench=10000` — synthetic items for canvas performance work (spike S1, §4.13). These never
 * touch the database or a real Platform; they're plain rectangles for the canvas engine to
 * render and cull, so the bench measures rendering, not ingest.
 */
export interface BenchRect {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  color: number;
}

const PALETTE = [0xe9a845, 0x93b89d, 0xf0b7b3, 0xb7a6e8, 0x8cc6e6, 0xefe6d6];

/** Lays out `count` rectangles in a loose grid over a large world area, sized like image cards. */
export function generateBenchRects(count: number): BenchRect[] {
  const cols = Math.ceil(Math.sqrt(count) * 1.4);
  const cellSize = 360;
  const rects: BenchRect[] = [];
  // A small deterministic PRNG (mulberry32) so bench runs are repeatable.
  let seed = 0x9e3779b9;
  const rand = () => {
    seed = Math.imul(seed ^ (seed >>> 15), seed | 1);
    seed ^= seed + Math.imul(seed ^ (seed >>> 7), seed | 61);
    return ((seed ^ (seed >>> 14)) >>> 0) / 4294967296;
  };

  for (let i = 0; i < count; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const long = 220 + rand() * 100;
    const aspect = 0.7 + rand() * 0.6;
    const w = aspect >= 1 ? long : long * aspect;
    const h = aspect >= 1 ? long / aspect : long;
    rects.push({
      id: `bench-${i}`,
      x: col * cellSize + rand() * 40,
      y: row * cellSize + rand() * 40,
      w,
      h,
      color: PALETTE[i % PALETTE.length],
    });
  }
  return rects;
}
