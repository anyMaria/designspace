import { describe, expect, it } from 'vitest';
import { Camera } from './Camera';

describe('Camera', () => {
  it('round-trips screenToWorld/worldToScreen at the identity transform', () => {
    const camera = new Camera();
    const world = camera.screenToWorld(400, 300, 800, 600);
    expect(world).toEqual({ x: 0, y: 0 });
    const screen = camera.worldToScreen(world.x, world.y, 800, 600);
    expect(screen).toEqual({ x: 400, y: 300 });
  });

  it('worldToScreen places the camera center at the viewport center', () => {
    const camera = new Camera();
    camera.x = 100;
    camera.y = -50;
    camera.zoom = 2;
    const screen = camera.worldToScreen(100, -50, 800, 600);
    expect(screen).toEqual({ x: 400, y: 300 });
  });

  it('panByScreen moves the world point under a fixed screen position', () => {
    const camera = new Camera();
    camera.zoom = 1;
    camera.panByScreen(50, -20);
    // Panning by a screen delta shifts the camera by delta/zoom in the opposite direction.
    expect(camera.x).toBeCloseTo(-50);
    expect(camera.y).toBeCloseTo(20);
  });

  it('zoomAt keeps the world point under the cursor fixed', () => {
    const camera = new Camera();
    camera.x = 10;
    camera.y = 10;
    camera.zoom = 1;
    const vw = 800;
    const vh = 600;
    const sx = 250;
    const sy = 180;
    const before = camera.screenToWorld(sx, sy, vw, vh);

    camera.zoomAt(sx, sy, 2.5, vw, vh);

    const after = camera.screenToWorld(sx, sy, vw, vh);
    expect(after.x).toBeCloseTo(before.x);
    expect(after.y).toBeCloseTo(before.y);
    expect(camera.zoom).toBe(2.5);
  });

  it('zoomAt clamps to the configured zoom range', () => {
    const camera = new Camera();
    camera.zoomAt(0, 0, 999, 100, 100);
    expect(camera.zoom).toBeLessThanOrEqual(8);
    camera.zoomAt(0, 0, 0.00001, 100, 100);
    expect(camera.zoom).toBeGreaterThanOrEqual(0.02);
  });

  it('viewportWorldRect grows with the margin and shrinks with zoom', () => {
    const camera = new Camera();
    camera.zoom = 2;
    const rect = camera.viewportWorldRect(800, 600, 0);
    expect(rect.w).toBeCloseTo(400);
    expect(rect.h).toBeCloseTo(300);
    const withMargin = camera.viewportWorldRect(800, 600, 0.2);
    expect(withMargin.w).toBeCloseTo(480);
  });

  it('notifies subscribers on pan and stops after unsubscribe', () => {
    const camera = new Camera();
    let calls = 0;
    const unsubscribe = camera.subscribe(() => {
      calls++;
    });
    camera.panByScreen(1, 1);
    expect(calls).toBe(1);
    unsubscribe();
    camera.panByScreen(1, 1);
    expect(calls).toBe(1);
  });
});
