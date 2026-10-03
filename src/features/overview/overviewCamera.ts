/** The Overview's own camera: `x`, `y` is the world point at the centre of the screen. */
export interface OverviewCamera {
  x: number;
  y: number;
  zoom: number;
}

export const OVERVIEW_ZOOM_MIN = 0.01;
export const OVERVIEW_ZOOM_MAX = 40;

export function worldToScreen(cam: OverviewCamera, wx: number, wy: number, w: number, h: number) {
  return { x: (wx - cam.x) * cam.zoom + w / 2, y: (wy - cam.y) * cam.zoom + h / 2 };
}

export function screenToWorld(cam: OverviewCamera, sx: number, sy: number, w: number, h: number) {
  return { x: (sx - w / 2) / cam.zoom + cam.x, y: (sy - h / 2) / cam.zoom + cam.y };
}

/** A camera that shows the whole `bounds` (with `pad` screen px of margin); empty → origin at 1×. */
export function fitCamera(
  bounds: { x: number; y: number; w: number; h: number } | null,
  w: number,
  h: number,
  pad = 80,
): OverviewCamera {
  if (!bounds) return { x: 0, y: 0, zoom: 1 };
  const zoom = Math.min(
    (w - pad * 2) / Math.max(bounds.w, 1),
    (h - pad * 2) / Math.max(bounds.h, 1),
  );
  return {
    x: bounds.x + bounds.w / 2,
    y: bounds.y + bounds.h / 2,
    zoom: Math.min(OVERVIEW_ZOOM_MAX, Math.max(OVERVIEW_ZOOM_MIN, zoom)),
  };
}

/** Zooms by `factor` keeping the world point under (sx, sy) fixed on screen. */
export function zoomAt(
  cam: OverviewCamera,
  factor: number,
  sx: number,
  sy: number,
  w: number,
  h: number,
): OverviewCamera {
  const zoom = Math.min(OVERVIEW_ZOOM_MAX, Math.max(OVERVIEW_ZOOM_MIN, cam.zoom * factor));
  const before = screenToWorld(cam, sx, sy, w, h);
  const next = { ...cam, zoom };
  const after = screenToWorld(next, sx, sy, w, h);
  return { x: cam.x + (before.x - after.x), y: cam.y + (before.y - after.y), zoom };
}

/** Pans by a screen-space drag. */
export function panBy(cam: OverviewCamera, dxScreen: number, dyScreen: number): OverviewCamera {
  return { ...cam, x: cam.x - dxScreen / cam.zoom, y: cam.y - dyScreen / cam.zoom };
}
