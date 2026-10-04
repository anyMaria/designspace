export interface MinimapRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface MinimapTransform {
  scale: number;
  originX: number;
  originY: number;
}

/** Fits `world` into a `width` × `height` map with `pad` world units of margin (the world rect is
 * the union of every item and the viewport, so panning never leaves the map). */
export function fitMinimap(
  world: MinimapRect,
  width: number,
  height: number,
  pad: number,
): MinimapTransform {
  const scale = Math.min(width / (world.w + pad * 2), height / (world.h + pad * 2));
  // Centre the content in the spare room along the short axis.
  const usedW = (world.w + pad * 2) * scale;
  const usedH = (world.h + pad * 2) * scale;
  return {
    scale,
    originX: world.x - pad - (width - usedW) / 2 / scale,
    originY: world.y - pad - (height - usedH) / 2 / scale,
  };
}

export function worldToMinimap(t: MinimapTransform, wx: number, wy: number) {
  return { x: (wx - t.originX) * t.scale, y: (wy - t.originY) * t.scale };
}

export function minimapToWorld(t: MinimapTransform, mx: number, my: number) {
  return { x: mx / t.scale + t.originX, y: my / t.scale + t.originY };
}

export interface MinimapScene {
  rects: (MinimapRect & { color: number })[];
  /** Pairs of world points: My connections (white) and hover/selection lines (their colour). */
  manualLines: { ax: number; ay: number; bx: number; by: number }[];
  hoverLines: { ax: number; ay: number; bx: number; by: number; color: number }[];
  viewport: MinimapRect | null;
}

const css = (n: number) => `#${n.toString(16).padStart(6, '0')}`;
const MIN_RECT_PX = 2;

/** Paints the minimap: items with their real shape and colour (at least 2 px), My connections,
 * the current hover/selection lines, then the viewport rectangle on top. */
export function drawMinimap(
  ctx: CanvasRenderingContext2D,
  t: MinimapTransform,
  scene: MinimapScene,
  accent: string,
): void {
  for (const r of scene.rects) {
    const p = worldToMinimap(t, r.x, r.y);
    ctx.fillStyle = css(r.color);
    ctx.fillRect(
      p.x,
      p.y,
      Math.max(MIN_RECT_PX, r.w * t.scale),
      Math.max(MIN_RECT_PX, r.h * t.scale),
    );
  }
  const line = (
    l: { ax: number; ay: number; bx: number; by: number },
    color: string,
    alpha: number,
  ) => {
    const a = worldToMinimap(t, l.ax, l.ay);
    const b = worldToMinimap(t, l.bx, l.by);
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  };
  for (const l of scene.manualLines) line(l, '#ffffff', 0.9);
  for (const l of scene.hoverLines) line(l, css(l.color), 0.9);
  ctx.globalAlpha = 1;
  if (scene.viewport) {
    const p = worldToMinimap(t, scene.viewport.x, scene.viewport.y);
    ctx.strokeStyle = accent;
    ctx.lineWidth = 1;
    ctx.strokeRect(p.x + 0.5, p.y + 0.5, scene.viewport.w * t.scale, scene.viewport.h * t.scale);
  }
}
