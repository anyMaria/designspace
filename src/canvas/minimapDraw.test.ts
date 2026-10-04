import { describe, expect, it } from 'vitest';
import { fitMinimap, minimapToWorld, worldToMinimap } from './minimapDraw';

describe('minimap transform', () => {
  it('fits the world with padding and keeps the aspect ratio', () => {
    const t = fitMinimap({ x: 0, y: 0, w: 1000, h: 500 }, 240, 160, 20);
    expect(t.scale).toBeCloseTo(240 / 1040);
    // the wide axis fills the map, the short axis is centred
    const topLeft = worldToMinimap(t, 0, 0);
    expect(topLeft.x).toBeCloseTo(20 * t.scale);
    expect(topLeft.y).toBeGreaterThan(20 * t.scale);
  });

  it('round-trips world ↔ map', () => {
    const t = fitMinimap({ x: -300, y: 40, w: 800, h: 900 }, 240, 160, 20);
    const m = worldToMinimap(t, 123, 456);
    const w = minimapToWorld(t, m.x, m.y);
    expect(w.x).toBeCloseTo(123);
    expect(w.y).toBeCloseTo(456);
  });

  it('keeps the whole padded world inside the map', () => {
    const world = { x: 100, y: 100, w: 400, h: 2000 };
    const t = fitMinimap(world, 240, 160, 20);
    const a = worldToMinimap(t, world.x - 20, world.y - 20);
    const b = worldToMinimap(t, world.x + world.w + 20, world.y + world.h + 20);
    expect(a.x).toBeGreaterThanOrEqual(-0.001);
    expect(a.y).toBeGreaterThanOrEqual(-0.001);
    expect(b.x).toBeLessThanOrEqual(240.001);
    expect(b.y).toBeLessThanOrEqual(160.001);
  });
});
