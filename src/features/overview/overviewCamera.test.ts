import { describe, expect, it } from 'vitest';
import { fitCamera, panBy, screenToWorld, worldToScreen, zoomAt } from './overviewCamera';

describe('overviewCamera', () => {
  it('round-trips world ↔ screen', () => {
    const cam = { x: 120, y: -40, zoom: 0.5 };
    const s = worldToScreen(cam, 300, 200, 1000, 600);
    const w = screenToWorld(cam, s.x, s.y, 1000, 600);
    expect(w.x).toBeCloseTo(300);
    expect(w.y).toBeCloseTo(200);
  });

  it('puts the camera point at the screen centre', () => {
    const cam = { x: 50, y: 70, zoom: 2 };
    expect(worldToScreen(cam, 50, 70, 800, 400)).toEqual({ x: 400, y: 200 });
  });

  it('fits bounds inside the window with a margin and centres them', () => {
    const cam = fitCamera({ x: 0, y: 0, w: 2000, h: 1000 }, 1000, 600, 50);
    expect(cam.x).toBe(1000);
    expect(cam.y).toBe(500);
    const a = worldToScreen(cam, 0, 0, 1000, 600);
    const b = worldToScreen(cam, 2000, 1000, 1000, 600);
    expect(a.x).toBeGreaterThanOrEqual(49.9);
    expect(b.x).toBeLessThanOrEqual(950.1);
    expect(b.y).toBeLessThanOrEqual(550.1);
  });

  it('an empty space fits to the origin at 1×', () => {
    expect(fitCamera(null, 100, 100)).toEqual({ x: 0, y: 0, zoom: 1 });
  });

  it('zooms around a point, keeping it fixed on screen', () => {
    const cam = { x: 0, y: 0, zoom: 1 };
    const before = screenToWorld(cam, 700, 100, 1000, 600);
    const next = zoomAt(cam, 3, 700, 100, 1000, 600);
    const after = screenToWorld(next, 700, 100, 1000, 600);
    expect(next.zoom).toBe(3);
    expect(after.x).toBeCloseTo(before.x);
    expect(after.y).toBeCloseTo(before.y);
  });

  it('clamps zoom and pans against the drag', () => {
    expect(zoomAt({ x: 0, y: 0, zoom: 30 }, 100, 0, 0, 10, 10).zoom).toBe(40);
    expect(panBy({ x: 0, y: 0, zoom: 2 }, 100, -50)).toEqual({ x: -50, y: 25, zoom: 2 });
  });
});
