import { zoomRange, motion } from '@/design/tokens';

export interface CameraState {
  x: number;
  y: number;
  zoom: number;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

/**
 * World↔screen transforms and camera motion for the canvas engine — §4.6. `x`/`y` are the world
 * point shown at the center of the viewport; `zoom` is screen pixels per world unit.
 * Framework-agnostic: React (or anything else) subscribes to be notified when it changes.
 */
export class Camera {
  x = 0;
  y = 0;
  zoom = 1;

  private listeners = new Set<() => void>();
  private flyToRaf: number | null = null;
  // Cached and only replaced on `notify()`, not on every `.state` read — `useSyncExternalStore`
  // (useCameraState.ts) needs a stable reference when nothing has changed.
  private cachedState: CameraState = { x: this.x, y: this.y, zoom: this.zoom };

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private notify(): void {
    this.cachedState = { x: this.x, y: this.y, zoom: this.zoom };
    for (const fn of this.listeners) fn();
  }

  get state(): CameraState {
    return this.cachedState;
  }

  screenToWorld(sx: number, sy: number, vw: number, vh: number): { x: number; y: number } {
    return {
      x: (sx - vw / 2) / this.zoom + this.x,
      y: (sy - vh / 2) / this.zoom + this.y,
    };
  }

  worldToScreen(wx: number, wy: number, vw: number, vh: number): { x: number; y: number } {
    return {
      x: (wx - this.x) * this.zoom + vw / 2,
      y: (wy - this.y) * this.zoom + vh / 2,
    };
  }

  /** Pans by a screen-space delta (e.g. from a wheel or drag event). */
  panByScreen(dxScreen: number, dyScreen: number): void {
    this.x -= dxScreen / this.zoom;
    this.y -= dyScreen / this.zoom;
    this.notify();
  }

  /** Zooms so the world point under (sx, sy) stays under the cursor. */
  zoomAt(sx: number, sy: number, nextZoom: number, vw: number, vh: number): void {
    const clamped = Math.min(zoomRange.max, Math.max(zoomRange.min, nextZoom));
    const before = this.screenToWorld(sx, sy, vw, vh);
    this.zoom = clamped;
    this.x = before.x - (sx - vw / 2) / clamped;
    this.y = before.y - (sy - vh / 2) / clamped;
    this.notify();
  }

  setZoomAroundCenter(nextZoom: number, vw: number, vh: number): void {
    this.zoomAt(vw / 2, vh / 2, nextZoom, vw, vh);
  }

  /** Sets the camera position directly, no easing — panning and the minimap's drag-to-navigate. */
  setPosition(x: number, y: number): void {
    this.x = x;
    this.y = y;
    this.notify();
  }

  /** Eases the camera to frame `rect` (with 10% padding). Instant if `reduceMotion`. */
  flyTo(rect: Rect, vw: number, vh: number, reduceMotion = false): void {
    const pad = 1.1;
    const targetZoom = Math.min(
      zoomRange.max,
      Math.max(zoomRange.min, Math.min(vw / (rect.w * pad), vh / (rect.h * pad)) || 1),
    );
    this.animateTo(
      { x: rect.x + rect.w / 2, y: rect.y + rect.h / 2, zoom: targetZoom },
      reduceMotion,
    );
  }

  /** Eases to a new zoom level around the viewport center, keeping the world point there fixed
   * — the zoom menu's "100 %"/"Zoom in"/"Zoom out" (§2.1, §2.2). */
  flyToZoom(targetZoom: number, reduceMotion = false): void {
    const clamped = Math.min(zoomRange.max, Math.max(zoomRange.min, targetZoom));
    this.animateTo({ x: this.x, y: this.y, zoom: clamped }, reduceMotion);
  }

  private animateTo(target: CameraState, reduceMotion: boolean): void {
    if (this.flyToRaf !== null) {
      cancelAnimationFrame(this.flyToRaf);
      this.flyToRaf = null;
    }
    if (reduceMotion) {
      this.x = target.x;
      this.y = target.y;
      this.zoom = target.zoom;
      this.notify();
      return;
    }

    const from = { x: this.x, y: this.y, zoom: this.zoom };
    const start = performance.now();
    const duration = motion.flyTo;
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const e = easeInOut(t);
      this.x = from.x + (target.x - from.x) * e;
      this.y = from.y + (target.y - from.y) * e;
      this.zoom = from.zoom + (target.zoom - from.zoom) * e;
      this.notify();
      if (t < 1) this.flyToRaf = requestAnimationFrame(step);
      else this.flyToRaf = null;
    };
    this.flyToRaf = requestAnimationFrame(step);
  }

  /** The world-space rectangle currently visible, expanded by `marginRatio` (culling query). */
  viewportWorldRect(vw: number, vh: number, marginRatio = 0.2): Rect {
    const w = (vw / this.zoom) * (1 + marginRatio);
    const h = (vh / this.zoom) * (1 + marginRatio);
    return { x: this.x - w / 2, y: this.y - h / 2, w, h };
  }
}
