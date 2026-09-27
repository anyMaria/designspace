import { describe, expect, it } from 'vitest';
import { generateBenchRects } from './bench';

describe('generateBenchRects', () => {
  it('generates the requested count with unique ids and positive sizes', () => {
    const rects = generateBenchRects(10_000);
    expect(rects).toHaveLength(10_000);
    expect(new Set(rects.map((r) => r.id)).size).toBe(10_000);
    for (const r of rects) {
      expect(r.w).toBeGreaterThan(0);
      expect(r.h).toBeGreaterThan(0);
    }
  });

  it('is deterministic across calls', () => {
    const a = generateBenchRects(200);
    const b = generateBenchRects(200);
    expect(a).toEqual(b);
  });
});
